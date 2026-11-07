import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { getFrontendBaseUrl } from '../../shared/utils/frontend-url';
import { paymentReturnBaseUrl } from '../property/website-domain.service';
import { isExpiredOnlineHold } from '../reservation/online-hold.service';
import { paymentConfiguration, verifyGuestPayment } from './guest-payment.service';

const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const activeStatuses = ['Initializing', 'Pending', 'Unknown'];
const recoveryDelayMs = 30000;
function providerReferenceMissing(error: any) {
  return [400, 404].includes(error.response?.status) && /^transaction (reference )?not found\.?$/i.test(String(error.response?.data?.message || '').trim());
}
async function ownedBooking(propertyCode: string, reservationId: string, guestId: number) {
  const booking = await prisma.reservation.findFirst({ where: { reservationId, platformGuestId: guestId, property: { propertyCode } } });
  if (!booking) throw failure('Booking not found.', 404);
  return booking;
}

export async function checkGuestPaymentStatus(propertyCode: string, reservationId: string, guestId: number) {
  let booking = await ownedBooking(propertyCode, reservationId, guestId);
  const attempt = await prisma.guestPaymentAttempt.findFirst({ where: { reservationId, status: { in: activeStatuses } }, orderBy: { attemptId: 'desc' } });
  let uncertain = false;
  let providerStatus = '';
  if (attempt) {
    try {
      const result = await verifyGuestPayment(propertyCode, attempt.reference);
      providerStatus = result.status;
      if (result.status === 'failed' || result.status === 'reversed') {
        await prisma.guestPaymentAttempt.updateMany({ where: { reference: attempt.reference, status: { not: 'Completed' } }, data: { status: 'Failed' } });
      }
    } catch (error) { uncertain = true; if (providerReferenceMissing(error)) providerStatus = 'not_found'; }
    booking = await ownedBooking(propertyCode, reservationId, guestId);
  }
  const amountPaid = Number(booking.amountPaid || 0);
  const balanceDue = Math.max(0, Number(booking.totalAmount || 0) - amountPaid);
  const released = ['Cancelled', 'Expired'].includes(booking.status);
  const retryable = attempt && ['Initializing', 'Unknown'].includes(attempt.status) && !attempt.checkoutUrl && Date.now() - attempt.updatedAt.getTime() >= recoveryDelayMs && providerStatus === 'not_found';
  const status = released ? 'released' : balanceDue === 0 && amountPaid > 0 ? 'paid'
    : retryable ? 'retryable' : uncertain ? 'unknown' : attempt && !['failed', 'reversed', 'success'].includes(providerStatus) ? 'pending' : 'unpaid';
  return { status, reservationId, bookingStatus: booking.status, confirmationCode: booking.confirmationCode, amountPaid, balanceDue,
    checkedReference: attempt?.reference, providerStatus,
    refundDue: Number(booking.refundDue), requiresRefundReview: booking.refundStatus === 'Pending',
    message: status === 'retryable' ? 'The payment checkout did not start. You can try again; we will reuse the same payment reference.'
      : status === 'unknown' ? 'Payment status is not yet confirmed. Check again before paying; do not start another booking if you were charged.'
      : status === 'released' && amountPaid > 0 ? 'Payment recorded. This booking was released and requires hotel refund review.'
      : status === 'paid' ? 'Payment received. No further payment is due.'
      : status === 'pending' ? 'Payment is still pending. If you were charged, wait and check again before paying.'
      : status === 'released' ? 'This booking has been released. Check its payment and refund details.'
      : amountPaid > 0 ? `GHS ${amountPaid.toFixed(2)} received. Remaining balance: GHS ${balanceDue.toFixed(2)}.`
      : 'No successful payment is recorded. You can continue payment for this booking.' };
}

export async function initializeGuestPayment(propertyCode: string, reservationId: string, guest: { guestId: number; email?: string | null }, siteHostname?: unknown) {
  const checked = await checkGuestPaymentStatus(propertyCode, reservationId, guest.guestId);
  if (['paid', 'released', 'unknown'].includes(checked.status)) return checked;
  const { property, secret } = await paymentConfiguration(propertyCode);
  const returnBaseUrl = await paymentReturnBaseUrl(siteHostname, property.propertyId, getFrontendBaseUrl());
  const prepared = await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<any[]>`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${reservationId} AND "propertyId" = ${property.propertyId} AND "platformGuestId" = ${guest.guestId} FOR UPDATE`;
    if (!locked.length) throw failure('Booking not found.', 404);
    const booking = await tx.reservation.findUniqueOrThrow({ where: { reservationId } });
    if (!['Pending', 'Confirmed'].includes(booking.status) || isExpiredOnlineHold(booking)) throw failure('This booking is no longer available for payment. Check My Reservations.');
    const amount = Math.round((Number(booking.totalAmount || 0) - Number(booking.amountPaid || 0)) * 100) / 100;
    if (amount <= 0) return { status: 'paid' as const };
    const existing = await tx.guestPaymentAttempt.findFirst({ where: { reservationId, status: { in: activeStatuses } }, orderBy: { attemptId: 'desc' } });
    if (existing) {
      const changedBalance = Number(existing.amount) !== amount;
      if (checked.status === 'retryable' && checked.checkedReference === existing.reference && ['Initializing', 'Unknown'].includes(existing.status) && !existing.checkoutUrl && Date.now() - existing.updatedAt.getTime() >= recoveryDelayMs) {
        // Reuse the reference: never create a second charge opportunity after an uncertain initialize.
        const attempt = await tx.guestPaymentAttempt.update({ where: { attemptId: existing.attemptId }, data: { status: 'Initializing', amount, currency: property.currency } });
        return { status: 'new' as const, attempt };
      } else if (changedBalance && checked.checkedReference === existing.reference && checked.providerStatus === 'abandoned') {
        // Keep the old reference for late-settlement reconciliation; never redirect to its stale amount.
        await tx.guestPaymentAttempt.update({ where: { attemptId: existing.attemptId }, data: { status: 'Superseded' } });
      } else {
        return { status: 'pending' as const, reference: existing.reference,
          authorization_url: changedBalance ? null : existing.checkoutUrl,
          message: changedBalance
            ? `An earlier GHS ${Number(existing.amount).toFixed(2)} payment is not yet resolved. Your remaining balance is GHS ${amount.toFixed(2)}. Check payment status before paying again.`
            : 'Continue the existing payment attempt, or check its status if you were charged.',
        };
      }
    }
    // Commit the reference BEFORE contacting Paystack, so a lost response cannot create a second attempt.
    const attempt = await tx.guestPaymentAttempt.create({ data: { reservationId, reference: `RES-${reservationId}-${randomUUID()}`, amount, currency: property.currency } });
    return { status: 'new' as const, attempt };
  });
  if (prepared.status !== 'new') return prepared;
  const { attempt } = prepared;
  try {
    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email: guest.email || 'guest@hideout24.com', amount: Math.round(Number(attempt.amount) * 100), reference: attempt.reference,
      currency: attempt.currency, channels: ['mobile_money', 'card'],
      callback_url: `${returnBaseUrl}/public/${encodeURIComponent(propertyCode)}/booking-success`, metadata: { propertyCode, reservationId },
    }, { headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    const checkoutUrl = response.data?.data?.authorization_url;
    if (typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) throw failure('Payment initialization was not confirmed.');
    await prisma.guestPaymentAttempt.updateMany({ where: { attemptId: attempt.attemptId, status: { not: 'Completed' } }, data: { status: 'Pending', checkoutUrl } });
    const latest = await ownedBooking(propertyCode, reservationId, guest.guestId);
    if (['Cancelled', 'Expired'].includes(latest.status) || isExpiredOnlineHold(latest)) return { status: 'released', message: 'This booking has been released. Do not pay for it.' };
    if (Number(latest.amountPaid) >= Number(latest.totalAmount)) return { status: 'paid', message: 'Payment already received.' };
    return { status: 'pending', reference: attempt.reference, authorization_url: checkoutUrl };
  } catch {
    await prisma.guestPaymentAttempt.updateMany({ where: { attemptId: attempt.attemptId, status: { not: 'Completed' } }, data: { status: 'Unknown' } });
    return { status: 'unknown', reservationId, message: 'Could not confirm the payment attempt. Check payment status in My Reservations before trying again.' };
  }
}
