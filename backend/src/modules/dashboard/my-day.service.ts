import { prisma } from '../../shared/utils/prisma';
import { dayBounds, hotelDate } from '../reports/daily-overview.service';

const CHECK_IN = ['CheckedIn', 'ReservationCheckin'];
const CHECK_OUT = ['CheckedOut', 'ReservationCheckout', 'CreditCheckoutApproved'];
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

// What the signed-in staff member handled today (hotel time): check-ins, check-outs, bookings made
// and money taken. Read from existing records (audit log, reservations, payments) — nothing new is stored.
export async function getMyDay(userId: number, propertyId: number, now = new Date()) {
  const property = await prisma.property.findUnique({ where: { propertyId }, select: { timezone: true } });
  const timeZone = property?.timezone || 'Africa/Accra';
  const date = hotelDate(now, timeZone);
  const { gte, lt } = dayBounds(date, timeZone);
  const [audits, bookingsMade, payments] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId, entityType: 'Reservation', action: { in: [...CHECK_IN, ...CHECK_OUT] }, createdAt: { gte, lt } },
      select: { action: true, newData: true },
    }),
    prisma.reservation.count({ where: { propertyId, staffId: userId, createdAt: { gte, lt } } }),
    prisma.payment.findMany({ where: { propertyId, receivedBy: userId, status: 'Completed', paymentDate: { gte, lt } }, select: { amount: true } }),
  ]);
  const bookingsOf = (actions: string[]) => new Set(audits.filter(a => actions.includes(a.action)).map(a => (a.newData as any)?.reservationId).filter(Boolean)).size;
  const roomsOf = (actions: string[]) => audits.filter(a => actions.includes(a.action)).length;
  return {
    date,
    checkIns: { bookings: bookingsOf(CHECK_IN), rooms: roomsOf(CHECK_IN) },
    checkOuts: { bookings: bookingsOf(CHECK_OUT), rooms: roomsOf(CHECK_OUT) },
    bookingsMade,
    payments: { count: payments.length, total: money(payments.reduce((sum, p) => sum + Number(p.amount), 0)) },
  };
}
