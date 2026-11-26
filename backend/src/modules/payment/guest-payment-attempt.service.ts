import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { isExpiredOnlineHold } from '../reservation/online-hold.service';
import { canBookOnline, OnlineBookingPausedError, publicBookingFields } from '../reservation/public-booking-policy';
import { paymentConfiguration, verifyGuestPayment } from './guest-payment.service';
import { initiatePayment, InitiateResult, MoolreConfig, normalizeChannel, normalizePayer, payerMessage } from './moolre.client';

const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
// OtpRequired: the SMS code was sent but no payment prompt yet, so nothing can be charged.
// Verifying: the code is being checked and the prompt may be on its way.
const activeStatuses = ['Initializing', 'OtpRequired', 'Verifying', 'Pending', 'Unknown'];
const recoveryDelayMs = 30000;

async function ownedBooking(propertyCode: string, reservationId: string, guestId: number) {
  const booking = await prisma.reservation.findFirst({ where: { reservationId, platformGuestId: guestId, property: { propertyCode } } });
  if (!booking) throw failure('Booking not found.', 404);
  return booking;
}
const maskPhone = (phone?: string | null) => (phone ? `${phone.slice(0, 3)}****${phone.slice(-3)}` : 'your phone');

export async function checkGuestPaymentStatus(propertyCode: string, reservationId: string, guestId: number) {
  let booking = await ownedBooking(propertyCode, reservationId, guestId);
  const attempt = await prisma.guestPaymentAttempt.findFirst({ where: { reservationId, status: { in: activeStatuses } }, orderBy: { attemptId: 'desc' } });
  let uncertain = false;
  let providerStatus = '';
  if (attempt) {
    try {
      const result = await verifyGuestPayment(propertyCode, attempt.reference);
      providerStatus = result.status;
      if (result.status === 'failed') {
        await prisma.guestPaymentAttempt.updateMany({ where: { reference: attempt.reference, status: { not: 'Completed' } }, data: { status: 'Failed' } });
      }
    } catch { uncertain = true; }
    booking = await ownedBooking(propertyCode, reservationId, guestId);
  }
  const amountPaid = Number(booking.amountPaid || 0);
  const balanceDue = Math.max(0, Number(booking.totalAmount || 0) - amountPaid);
  const released = ['Cancelled', 'Expired'].includes(booking.status);
  // Moolre has no record of this reference after a while: the prompt never went out, so restarting
  // with the SAME reference is safe (it can never create a second charge).
  const retryable = attempt && ['Initializing', 'Unknown', 'Verifying'].includes(attempt.status) && Date.now() - attempt.updatedAt.getTime() >= recoveryDelayMs && providerStatus === 'not_found';
  const otpRequired = attempt?.status === 'OtpRequired' && providerStatus !== 'success';
  const status = released ? 'released' : balanceDue === 0 && amountPaid > 0 ? 'paid'
    : retryable ? 'retryable' : otpRequired ? 'otp_required' : uncertain ? 'unknown'
    : attempt && !['failed', 'success'].includes(providerStatus) ? 'pending' : 'unpaid';
  return { status, reservationId, bookingStatus: booking.status, confirmationCode: booking.confirmationCode, amountPaid, balanceDue,
    checkedReference: attempt?.reference, providerStatus, payer: attempt?.payer ? maskPhone(attempt.payer) : undefined,
    refundDue: Number(booking.refundDue), requiresRefundReview: booking.refundStatus === 'Pending',
    message: status === 'retryable' ? 'The payment prompt was not sent. You can try again; we will reuse the same payment reference.'
      : status === 'otp_required' ? `Enter the code sent by SMS to ${maskPhone(attempt?.payer)} to continue, or start again.`
      : status === 'unknown' ? 'Payment status is not yet confirmed. Check again before paying; do not start another booking if you were charged.'
      : status === 'released' && amountPaid > 0 ? 'Payment recorded. This booking was released and requires hotel refund review.'
      : status === 'paid' ? 'Payment received. No further payment is due.'
      : status === 'pending' ? 'Payment is still pending. Approve the prompt on your phone; if you were charged, wait and check again before paying.'
      : status === 'released' ? 'This booking has been released. Check its payment and refund details.'
      : amountPaid > 0 ? `GHS ${amountPaid.toFixed(2)} received. Remaining balance: GHS ${balanceDue.toFixed(2)}.`
      : 'No successful payment is recorded. You can continue payment for this booking.' };
}

type Attempt = { attemptId: number; reference: string; amount: unknown; payer: string | null; channel: string | null };

/** Records what Moolre said and turns it into the reply for the guest. */
async function applyOutcome(attempt: Attempt, result: InitiateResult, fromStatus: string[]) {
  const where = { attemptId: attempt.attemptId, status: { in: fromStatus } };
  if (result.outcome === 'prompt_sent') {
    await prisma.guestPaymentAttempt.updateMany({ where, data: { status: 'Pending' } });
    return { status: 'pending', reference: attempt.reference, message: `A payment prompt was sent to ${maskPhone(attempt.payer)}. Approve it with your mobile money PIN.` };
  }
  if (result.outcome === 'otp_required') {
    await prisma.guestPaymentAttempt.updateMany({ where, data: { status: 'OtpRequired' } });
    return { status: 'otp_required', reference: attempt.reference, message: `Enter the code sent by SMS to ${maskPhone(attempt.payer)}.` };
  }
  if (result.outcome === 'otp_invalid') {
    await prisma.guestPaymentAttempt.updateMany({ where, data: { status: 'OtpRequired' } });
    return { status: 'otp_required', reference: attempt.reference, message: 'That code is wrong or has expired. Check the SMS and try again.' };
  }
  if (result.outcome === 'rejected') {
    // Moolre refused before any prompt reached the phone: nothing was charged.
    await prisma.guestPaymentAttempt.updateMany({ where, data: { status: 'Failed' } });
    return { status: 'failed', reference: attempt.reference, message: payerMessage(result) };
  }
  await prisma.guestPaymentAttempt.updateMany({ where, data: { status: 'Unknown' } });
  return { status: 'unknown', reference: attempt.reference, message: 'Could not confirm the payment attempt. Check payment status in My Reservations before trying again.' };
}

const sendPrompt = (moolre: MoolreConfig, attempt: Attempt, extra: { otpcode?: string; idempotencyKey?: string } = {}) =>
  initiatePayment(moolre, { channel: attempt.channel!, payer: attempt.payer!, amount: Number(attempt.amount), externalref: attempt.reference, ...extra });

async function releasedOrPaid(propertyCode: string, reservationId: string, guestId: number) {
  const latest = await ownedBooking(propertyCode, reservationId, guestId);
  if (['Cancelled', 'Expired'].includes(latest.status) || isExpiredOnlineHold(latest)) return { status: 'released', message: 'This booking has been released. Do not pay for it.' };
  if (Number(latest.amountPaid) >= Number(latest.totalAmount)) return { status: 'paid', message: 'Payment already received.' };
  return null;
}

export async function initializeGuestPayment(propertyCode: string, reservationId: string, guest: { guestId: number }, payment: { phone?: unknown; network?: unknown }) {
  const payer = normalizePayer(payment.phone);
  const channel = normalizeChannel(payment.network);
  if (!payer) throw failure('Enter a valid 10-digit mobile money number, e.g. 0241234567.');
  if (!channel) throw failure('Choose the mobile money network: MTN, Telecel or AT.');
  const checked = await checkGuestPaymentStatus(propertyCode, reservationId, guest.guestId);
  if (['paid', 'released', 'unknown'].includes(checked.status)) return checked;
  const { property, moolre } = await paymentConfiguration(propertyCode);
  if (property.currency !== 'GHS') throw failure('Online mobile money payments need the hotel currency set to GHS.', 503);
  const prepared = await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<any[]>`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${reservationId} AND "propertyId" = ${property.propertyId} AND "platformGuestId" = ${guest.guestId} FOR UPDATE`;
    if (!locked.length) throw failure('Booking not found.', 404);
    const booking = await tx.reservation.findUniqueOrThrow({ where: { reservationId } });
    if (!['Pending', 'Confirmed'].includes(booking.status) || isExpiredOnlineHold(booking)) throw failure('This booking is no longer available for payment. Check My Reservations.');
    const amount = Math.round((Number(booking.totalAmount || 0) - Number(booking.amountPaid || 0)) * 100) / 100;
    if (amount <= 0) return { status: 'paid' as const };
    const existing = await tx.guestPaymentAttempt.findFirst({ where: { reservationId, status: { in: activeStatuses } }, orderBy: { attemptId: 'desc' } });
    const currentProperty = await tx.property.findUniqueOrThrow({ where: { propertyId: property.propertyId }, select: publicBookingFields });
    const bookingOpen = canBookOnline(currentProperty);
    if (existing) {
      const changedBalance = Number(existing.amount) !== amount;
      if (checked.status === 'retryable' && checked.checkedReference === existing.reference && ['Initializing', 'Unknown', 'Verifying'].includes(existing.status) && Date.now() - existing.updatedAt.getTime() >= recoveryDelayMs) {
        // Reuse the reference: never create a second charge opportunity after an uncertain start.
        if (!bookingOpen) throw new OnlineBookingPausedError();
        const attempt = await tx.guestPaymentAttempt.update({ where: { attemptId: existing.attemptId }, data: { status: 'Initializing', amount, currency: 'GHS', payer, channel } });
        return { status: 'new' as const, attempt };
      } else if (existing.status === 'OtpRequired' && checked.checkedReference === existing.reference && checked.status === 'otp_required') {
        // Only an SMS code was sent; no prompt ever reached the phone. Keep the old reference for
        // reconciliation and start fresh (e.g. a different number or an expired code).
        await tx.guestPaymentAttempt.update({ where: { attemptId: existing.attemptId }, data: { status: 'Superseded' } });
      } else {
        return { status: 'pending' as const, reference: existing.reference,
          message: changedBalance
            ? `An earlier GHS ${Number(existing.amount).toFixed(2)} payment is not yet resolved. Your remaining balance is GHS ${amount.toFixed(2)}. Check payment status before paying again.`
            : 'A payment prompt was already sent. Approve it on your phone, or check its status if you were charged.',
        };
      }
    }
    // Commit the reference BEFORE contacting Moolre, so a lost response cannot create a second attempt.
    if (!bookingOpen) throw new OnlineBookingPausedError();
    const attempt = await tx.guestPaymentAttempt.create({ data: { reservationId, reference: `RES-${reservationId}-${randomUUID()}`, amount, currency: 'GHS', payer, channel } });
    return { status: 'new' as const, attempt };
  });
  if (prepared.status !== 'new') return prepared;
  const result = await applyOutcome(prepared.attempt, await sendPrompt(moolre, prepared.attempt), ['Initializing']);
  if (result.status === 'pending') return (await releasedOrPaid(propertyCode, reservationId, guest.guestId)) || result;
  return result;
}

export async function submitGuestPaymentOtp(propertyCode: string, reservationId: string, guest: { guestId: number }, otp: unknown) {
  const code = String(otp ?? '').trim();
  if (!/^\d{4,8}$/.test(code)) throw failure('Enter the code from the SMS.');
  await ownedBooking(propertyCode, reservationId, guest.guestId);
  const attempt = await prisma.guestPaymentAttempt.findFirst({ where: { reservationId, status: 'OtpRequired' }, orderBy: { attemptId: 'desc' } });
  if (!attempt) throw failure('No payment is waiting for a code. Check payment status.', 409);
  // Claim the attempt so a double click cannot send two prompts.
  const claim = await prisma.guestPaymentAttempt.updateMany({ where: { attemptId: attempt.attemptId, status: 'OtpRequired' }, data: { status: 'Verifying' } });
  if (claim.count !== 1) throw failure('This code is already being checked. Check payment status.', 409);
  const { moolre } = await paymentConfiguration(propertyCode);
  const verified = await sendPrompt(moolre, attempt, { otpcode: code });
  if (verified.outcome !== 'otp_verified') return applyOutcome(attempt, verified, ['Verifying']);
  // Phone verified: resend the original request (same body) with the reference as Idempotency-Key.
  const prompt = await sendPrompt(moolre, attempt, { idempotencyKey: attempt.reference });
  const result = await applyOutcome(attempt, prompt, ['Verifying']);
  if (result.status === 'pending') return (await releasedOrPaid(propertyCode, reservationId, guest.guestId)) || result;
  return result;
}
