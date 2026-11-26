import { prisma } from '../../shared/utils/prisma';
import { isExpiredOnlineHold } from '../reservation/online-hold.service';
import { restoreLatePaymentAllocation } from './late-payment-allocation';
import { recordSimulatedSms } from '../notifications/simulated-sms.service';
import { checkPaymentStatus, MoolreConfig, platformMoolreConfig } from './moolre.client';

const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

type MoolreKeys = { moolreUsername: string | null; moolrePublicKey: string | null; moolreAccountNumber: string | null; moolreWebhookSecret: string | null };
/** The hotel's own Moolre wallet when fully configured, otherwise the platform wallet from env. */
export function moolreConfigFor(keys: MoolreKeys): MoolreConfig | null {
  if (keys.moolreUsername && keys.moolrePublicKey && keys.moolreAccountNumber) {
    return { user: keys.moolreUsername, pubkey: keys.moolrePublicKey, account: keys.moolreAccountNumber, webhookSecret: keys.moolreWebhookSecret };
  }
  return platformMoolreConfig();
}

export async function paymentConfiguration(propertyCode: string) {
  const property = await prisma.property.findUnique({
    where: { propertyCode },
    select: { propertyId: true, propertyCode: true, currency: true, moolreUsername: true, moolrePublicKey: true, moolreAccountNumber: true, moolreWebhookSecret: true },
  });
  if (!property) throw failure('Payment property not found.', 404);
  const moolre = moolreConfigFor(property);
  if (!moolre) throw failure('Property Moolre configuration not found.', 503);
  return { property, moolre };
}

// Status checks, the guest's browser and webhook delivery all use the same locked settlement.
export async function verifyGuestPayment(propertyCode: string, reference: string) {
  if (!reference || reference.length > 200) throw failure('Invalid payment reference.');
  const { property, moolre } = await paymentConfiguration(propertyCode);
  const recorded = await prisma.payment.findFirst({ where: { gatewayReference: reference, status: 'Completed', reservation: { propertyId: property.propertyId } }, include: { reservation: true } });
  if (recorded && reference.startsWith(`RES-${recorded.reservationId}-`)) {
    return { success: true, status: 'success', data: { reference, amount: Math.round(Number(recorded.amount) * 100), currency: property.currency,
      channel: recorded.paymentMethod === 'Card' ? 'card' : recorded.paymentMethod === 'MobileMoney' ? 'mobile_money' : 'online',
      confirmationCode: recorded.reservation.confirmationCode, bookingStatus: recorded.reservation.status,
      requiresRefundReview: ['Cancelled', 'Expired'].includes(recorded.reservation.status) || recorded.reservation.refundStatus === 'Pending',
    } };
  }
  // The saved attempt (created before Moolre was contacted) is the source of truth for booking, amount and currency.
  const savedAttempt = await prisma.guestPaymentAttempt.findUnique({ where: { reference }, include: { reservation: { select: { propertyId: true } } } });
  if (!savedAttempt || savedAttempt.reservation.propertyId !== property.propertyId || !reference.startsWith(`RES-${savedAttempt.reservationId}-`)) {
    throw failure('Payment does not match this hotel booking.', 404);
  }
  const reservationId = savedAttempt.reservationId;
  const provider = await checkPaymentStatus(moolre, reference);
  if (provider.status !== 'success') {
    return { success: true, status: provider.status, data: { reference, confirmationCode: null } };
  }
  const amount = Number(savedAttempt.amount);
  if (provider.externalref && provider.externalref !== reference) throw failure('Payment reference does not match.');
  if (provider.amount === null || !Number.isFinite(provider.amount) || Math.round(provider.amount * 100) !== Math.round(amount * 100)
    || savedAttempt.currency !== 'GHS' || property.currency !== 'GHS') {
    throw failure('Invalid booking payment amount, currency, or reference.');
  }
  const transaction = { reference, status: 'success', amount: Math.round(amount * 100), currency: 'GHS', channel: 'mobile_money' };

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
    if (!attempt || attempt.reservationId !== reservationId || Math.round(Number(attempt.amount) * 100) !== transaction.amount || attempt.currency !== transaction.currency) throw failure('Payment does not match its saved attempt.');
    const existing = await tx.payment.findFirst({ where: { gatewayReference: reference } });
    if (existing) {
      if (existing.reservationId !== reservationId || Math.round(Number(existing.amount) * 100) !== transaction.amount) {
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
    // Online payments are strictly non-refundable: a late or extra online payment never becomes a refund due.
    const refundIncrement = 0;
    void newOverpayment;
    if (late && !restored) {
      await tx.reservationRoom.updateMany({ where: { reservationId, status: 'Reserved' }, data: { status: 'Cancelled' } });
      await tx.auditLog.create({ data: { entityType: 'Reservation', action: 'OnlinePaymentHoldExpired', oldData: { reservationId, status: reservation.status }, newData: { reservationId, status: 'Expired', reason: 'Payment arrived after the 10-minute hold expired. Allocation released and payment flagged for refund review.' } } });
    }
    const paymentMethod = 'MobileMoney';
    await tx.payment.create({ data: {
      reservationId, propertyId: property.propertyId, amount, paymentMethod,
      gatewayReference: reference, status: 'Completed', receivedBy: null,
      verifiedProvider: 'Moolre', verifiedAt: new Date(), // confirmed by Moolre: never editable
      notes: 'Online mobile money payment verified with Moolre.',
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
  if (settlement.bookingStatus === 'Confirmed') await recordSimulatedSms(reservationId, 'confirmed');
  return { success: true, status: transaction.status, data: { ...transaction, ...settlement } };
}
