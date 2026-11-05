import { prisma } from '../../shared/utils/prisma';

export type SmsEvent = 'confirmed' | 'cancelled';

export function normalizeGhanaSmsNumber(value: string | null | undefined): string | null {
  const raw = value?.trim().replace(/[\s()-]/g, '') || '';
  const digits = raw.startsWith('+') ? raw.slice(1) : raw;
  if (/^0[235]\d{8}$/.test(digits)) return `+233${digits.slice(1)}`;
  if (/^233[235]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

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
    const recipient = normalizeGhanaSmsNumber(booking.guestPhoneSnapshot);
    if (!recipient) return;
    const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: booking.property.timezone, day: 'numeric', month: 'short', year: 'numeric' }).format(value);
    const body = event === 'confirmed'
      ? `${booking.property.propertyName}: Your booking ${booking.confirmationCode} is confirmed for ${date(booking.checkInDate)} to ${date(booking.checkOutDate)}. Keep this code for check-in.`
      : `${booking.property.propertyName}: Booking ${booking.confirmationCode} has been cancelled. If a refund is due, the hotel will follow up separately.`;
    await prisma.simulatedSms.create({ data: {
      propertyId: booking.propertyId, reservationId, eventKey: `${reservationId}:${event}`,
      kind: event, recipient, body,
    } });
  } catch (error: any) {
    if (error?.code !== 'P2002') console.error('Could not record simulated SMS', { reservationId, event, error });
  }
}
