import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { isExpiredOnlineHold } from '../reservation/online-hold.service';
import { restoreLatePaymentAllocation } from './late-payment-allocation';

const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export async function paymentConfiguration(propertyCode: string) {
  const property = await prisma.property.findUnique({
    where: { propertyCode },
    select: { propertyId: true, propertyCode: true, currency: true, paystackSecretKey: true },
  });
  if (!property) throw failure('Payment property not found.', 404);
  const secret = property.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw failure('Property Paystack configuration not found.', 503);
  return { property, secret };
}

// Browser verification and webhook delivery must use the same locked settlement.
export async function verifyGuestPayment(propertyCode: string, reference: string) {
  if (!reference || reference.length > 200) throw failure('Invalid payment reference.');
  const { property, secret } = await paymentConfiguration(propertyCode);
  const recorded = await prisma.payment.findFirst({ where: { gatewayReference: reference, status: 'Completed', reservation: { propertyId: property.propertyId } }, include: { reservation: true } });
  if (recorded && reference.startsWith(`RES-${recorded.reservationId}-`)) {
    return { success: true, status: 'success', data: { reference, amount: Math.round(Number(recorded.amount) * 100), currency: property.currency,
      channel: recorded.paymentMethod === 'Card' ? 'card' : recorded.paymentMethod === 'MobileMoney' ? 'mobile_money' : 'online',
      confirmationCode: recorded.reservation.confirmationCode, bookingStatus: recorded.reservation.status,
      requiresRefundReview: ['Cancelled', 'Expired'].includes(recorded.reservation.status) || recorded.reservation.refundStatus === 'Pending',
    } };
  }
  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` }, timeout: 15000 },
  );
  const transaction = response.data?.data;
  if (!response.data?.status || !transaction) throw failure('Could not verify guest payment.', 502);
  if (transaction.reference !== reference) throw failure('Payment reference does not match.');
  if (transaction.status !== 'success') {
    return { success: true, status: transaction.status, data: { ...transaction, confirmationCode: null } };
  }
  const reservationId = transaction.metadata?.reservationId;
  if (typeof reservationId !== 'string' || transaction.metadata?.propertyCode !== propertyCode) {
    throw failure('Payment does not match this hotel booking.');
  }
  if (!reference.startsWith(`RES-${reservationId}-`)
    || !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0
    || transaction.currency !== property.currency) {
    throw failure('Invalid booking payment amount, currency, or reference.');
  }

  let settlement: any;
  for (let retry = 0; ; retry++) {
    try {
      settlement = await prisma.$transaction(async tx => {
    // Serialize duplicate webhooks and browser callbacks for this reservation.
    // The lock lasts until payment creation AND balance update commit or roll back.
    const locked = await tx.$queryRaw<{ reservationId: string }[]>`
      SELECT "reservationId" FROM "reservations"
      WHERE "reservationId" = ${reservationId} AND "propertyId" = ${property.propertyId}
      FOR UPDATE`;
    if (!locked.length) throw failure('Booking not found for this hotel.', 404);
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { reservationId } });
    const attempt = await tx.guestPaymentAttempt.findUnique({ where: { reference } });
    if (attempt && (attempt.reservationId !== reservationId || Number(attempt.amount) !== transaction.amount / 100 || attempt.currency !== transaction.currency)) throw failure('Payment does not match its saved attempt.');
    const existing = await tx.payment.findFirst({ where: { gatewayReference: reference } });
    if (existing) {
      if (existing.reservationId !== reservationId || Number(existing.amount) !== transaction.amount / 100) {
        throw failure('Payment reference is already linked to a different transaction.');
      }
      return { confirmationCode: reservation.confirmationCode, bookingStatus: reservation.status, requiresRefundReview: ['Cancelled', 'Expired'].includes(reservation.status) || reservation.refundStatus === 'Pending' };
    }
    const amount = transaction.amount / 100;
    const expired = isExpiredOnlineHold(reservation);
    const late = expired || reservation.status === 'Expired';
    const restored = late && await restoreLatePaymentAllocation(tx, reservation);
    const released = (late && !restored) || reservation.status === 'Cancelled';
    const paidBefore = Number(reservation.amountPaid || 0);
    const total = Number(reservation.totalAmount);
    const newOverpayment = Number.isFinite(total)
      ? Math.max(0, Math.round((paidBefore + amount - total) * 100)) - Math.max(0, Math.round((paidBefore - total) * 100)) : 0;
    const refundIncrement = released ? amount : newOverpayment / 100;
    if (late && !restored) {
      await tx.reservationRoom.updateMany({ where: { reservationId, status: 'Reserved' }, data: { status: 'Cancelled' } });
      await tx.auditLog.create({ data: { entityType: 'Reservation', action: 'OnlinePaymentHoldExpired', oldData: { reservationId, status: reservation.status }, newData: { reservationId, status: 'Expired', reason: 'Payment arrived after the 10-minute hold expired. Allocation released and payment flagged for refund review.' } } });
    }
    const paymentMethod = transaction.channel === 'card' ? 'Card'
      : transaction.channel === 'mobile_money' ? 'MobileMoney' : 'Online';
    await tx.payment.create({ data: {
      reservationId, propertyId: property.propertyId, amount, paymentMethod,
      gatewayReference: reference, status: 'Completed', receivedBy: null,
      notes: 'Online payment verified with Paystack.',
    } });
    await tx.reservation.update({ where: { reservationId }, data: {
      amountPaid: { increment: amount },
      ...(restored ? { status: 'Confirmed' as const } : late ? { status: 'Expired' as const } : reservation.status === 'Pending' ? { status: 'Confirmed' as const } : {}),
      // Never resurrect a cancelled/completed/in-house stay when settlement is delayed.
      ...(refundIncrement > 0 ? {
        refundDue: { increment: refundIncrement }, refundStatus: 'Pending',
      } : {}),
    } });
    await tx.guestPaymentAttempt.updateMany({ where: { reference }, data: { status: 'Completed' } });
    return { confirmationCode: reservation.confirmationCode, bookingStatus: restored ? 'Confirmed' : late ? 'Expired' : reservation.status === 'Pending' ? 'Confirmed' : reservation.status, requiresRefundReview: released || refundIncrement > 0 || reservation.refundStatus === 'Pending' };
      }, { isolationLevel: 'Serializable', timeout: 15000 });
      break;
    } catch (error: any) {
      if (!['P2034', 'P2010'].includes(error.code) || (error.code === 'P2010' && !['40001', '40P01'].includes(error.meta?.code)) || retry >= 2) throw error;
    }
  }
  return { success: true, status: transaction.status, data: { ...transaction, ...settlement } };
}

export async function processGuestPaymentWebhook(rawBody: unknown, signature: string | undefined) {
  if (!Buffer.isBuffer(rawBody) || !signature || !/^[a-fA-F0-9]{128}$/.test(signature)) {
    throw failure('Invalid Paystack webhook signature.', 401);
  }
  let event: any;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { throw failure('Invalid webhook payload.'); }
  // Metadata is only a routing hint until the raw body signature is checked.
  const propertyCode = event?.data?.metadata?.propertyCode;
  const secret = typeof propertyCode === 'string' && propertyCode.length <= 50
    ? (await paymentConfiguration(propertyCode)).secret : process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw failure('Webhook signing key is not configured.', 503);
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    throw failure('Invalid Paystack webhook signature.', 401);
  }
  if (event.event !== 'charge.success') return;
  // Subscription/unrelated charges on a shared account belong to other handlers.
  if (!event.data?.metadata?.reservationId && !String(event.data?.reference || '').startsWith('RES-')) return;
  if (typeof propertyCode !== 'string' || typeof event.data?.reference !== 'string') {
    throw failure('Guest payment webhook is missing booking metadata.');
  }
  const result = await verifyGuestPayment(propertyCode, event.data.reference);
  if (result.status !== 'success') throw failure('Guest payment is not yet verified as successful.', 503);
}
