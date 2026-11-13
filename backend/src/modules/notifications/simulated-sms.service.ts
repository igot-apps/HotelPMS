import { prisma } from '../../shared/utils/prisma';
import { normalizeGhanaPhoneNumber } from '../../shared/utils/ghanaPhone';
import { createMoolreReference, isMoolreSmsConfigured, MoolreSmsError, sendMoolreSms } from './moolre-sms.service';

export type SmsEvent = 'confirmed' | 'cancelled';

export const normalizeGhanaSmsNumber = normalizeGhanaPhoneNumber;

export async function recordSimulatedSms(reservationId: string, event: SmsEvent): Promise<void> {
  try {
    const booking = await prisma.reservation.findUnique({ where: { reservationId }, select: {
      reservationId: true, propertyId: true, status: true, source: true, amountPaid: true, totalAmount: true, confirmationCode: true, guestPhoneSnapshot: true,
      checkInDate: true, checkOutDate: true,
      payments: { where: { status: 'Completed' }, select: { amount: true } },
      property: { select: { propertyName: true, timezone: true, smsSimulationEnabled: true } },
    } });
    if (!booking?.property.smsSimulationEnabled || booking.source !== 'Website' || booking.status !== (event === 'confirmed' ? 'Confirmed' : 'Cancelled')) return;
    if (Number(booking.totalAmount) <= 0 || Number(booking.amountPaid) + 0.01 < Number(booking.totalAmount)) return;
    const completedPayments = booking.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (completedPayments + 0.01 < Number(booking.totalAmount)) return;
    const recipient = normalizeGhanaPhoneNumber(booking.guestPhoneSnapshot);
    if (!recipient) return;
    const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: booking.property.timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(value);
    const body = event === 'confirmed'
      ? `${booking.property.propertyName}: Your booking ${booking.confirmationCode} is confirmed for ${date(booking.checkInDate)} to ${date(booking.checkOutDate)}. Keep this code for check-in.`
      : `${booking.property.propertyName}: Booking ${booking.confirmationCode} has been cancelled. If a refund is due, the hotel will follow up separately.`;
    const live = isMoolreSmsConfigured();
    const providerReference = createMoolreReference(`${event}-${reservationId}`);
    const message = await prisma.simulatedSms.create({ data: {
      propertyId: booking.propertyId, reservationId, eventKey: `${reservationId}:${event}`,
      kind: event, recipient, body, provider: live ? 'moolre' : 'simulation', providerReference,
      sendStatus: live ? 'pending' : 'simulated',
    } });
    if (!live) return;
    try {
      const accepted = await sendMoolreSms({ recipient, message: body, reference: providerReference });
      await prisma.simulatedSms.update({ where: { messageId: message.messageId }, data: {
        sendStatus: 'accepted', providerCode: accepted.providerCode, acceptedAt: new Date(), failureReason: null,
      } });
    } catch (error) {
      const moolreError = error instanceof MoolreSmsError ? error : new MoolreSmsError('SMS could not be sent.', providerReference, true);
      await prisma.simulatedSms.update({ where: { messageId: message.messageId }, data: {
        sendStatus: moolreError.ambiguous ? 'uncertain' : 'failed', providerCode: moolreError.providerCode,
        failureReason: moolreError.ambiguous ? 'Provider response uncertain' : 'Provider rejected message',
      } });
      console.error('SMS send was not accepted', { reservationId, event, reference: providerReference, ambiguous: moolreError.ambiguous });
    }
  } catch (error: any) {
    if (error?.code !== 'P2002') console.error('Could not prepare SMS', { reservationId, event, errorCode: error?.code || 'unknown' });
  }
}
