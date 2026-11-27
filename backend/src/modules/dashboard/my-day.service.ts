import { auditAt } from '../../shared/utils/property-access';
import { prisma } from '../../shared/utils/prisma';
import { dayBounds, hotelDate } from '../reports/daily-overview.service';

const CHECK_IN = ['CheckedIn', 'ReservationCheckin'];
const CHECK_OUT = ['CheckedOut', 'ReservationCheckout', 'CreditCheckoutApproved'];
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const bookingSelect = { reservationId: true, confirmationCode: true, guestNameSnapshot: true, platformGuest: { select: { fullName: true } }, propertyGuest: { select: { fullName: true } } } as const;
const bookingRow = (r: any) => ({
  reservationId: r.reservationId,
  confirmationCode: r.confirmationCode,
  guestName: r.guestNameSnapshot || r.platformGuest?.fullName || r.propertyGuest?.fullName || 'Guest',
});

// What the signed-in staff member handled today (hotel time): check-ins, check-outs, bookings made
// and money taken. Read from existing records (audit log, reservations, payments) — nothing new is stored.
export async function getMyDay(userId: number, propertyId: number, now = new Date()) {
  const property = await prisma.property.findUnique({ where: { propertyId }, select: { timezone: true } });
  const timeZone = property?.timezone || 'Africa/Accra';
  const date = hotelDate(now, timeZone);
  const { gte, lt } = dayBounds(date, timeZone);
  const [audits, bookingsMade, payments] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId, ...auditAt(propertyId), entityType: 'Reservation', action: { in: [...CHECK_IN, ...CHECK_OUT] }, createdAt: { gte, lt } },
      select: { action: true, newData: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reservation.findMany({ where: { propertyId, staffId: userId, createdAt: { gte, lt } }, select: { ...bookingSelect, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.payment.findMany({
      where: { propertyId, receivedBy: userId, status: 'Completed', paymentDate: { gte, lt } },
      select: { paymentId: true, amount: true, paymentMethod: true, paymentDate: true, reservation: { select: bookingSelect } },
      orderBy: { paymentDate: 'desc' },
    }),
  ]);
  // The bookings behind the check-in and check-out figures, for the lists staff open from each tile.
  const auditedIds = [...new Set(audits.map(a => (a.newData as any)?.reservationId).filter(Boolean))] as string[];
  const audited = auditedIds.length
    ? await prisma.reservation.findMany({ where: { propertyId, reservationId: { in: auditedIds } }, select: bookingSelect })
    : [];
  const byId = new Map(audited.map(r => [r.reservationId, r]));
  const listOf = (actions: string[]) => {
    const rows = new Map<string, any>();
    for (const a of audits) {
      if (!actions.includes(a.action)) continue;
      const id = (a.newData as any)?.reservationId;
      const booking = id && byId.get(id);
      if (!booking) continue;
      const row = rows.get(id) || { ...bookingRow(booking), rooms: 0, at: a.createdAt };
      row.rooms += 1;
      rows.set(id, row);
    }
    return [...rows.values()];
  };
  const bookingsOf = (actions: string[]) => new Set(audits.filter(a => actions.includes(a.action)).map(a => (a.newData as any)?.reservationId).filter(Boolean)).size;
  const roomsOf = (actions: string[]) => audits.filter(a => actions.includes(a.action)).length;
  return {
    date,
    checkIns: { bookings: bookingsOf(CHECK_IN), rooms: roomsOf(CHECK_IN) },
    checkOuts: { bookings: bookingsOf(CHECK_OUT), rooms: roomsOf(CHECK_OUT) },
    bookingsMade: bookingsMade.length,
    payments: { count: payments.length, total: money(payments.reduce((sum, p) => sum + Number(p.amount), 0)) },
    lists: {
      checkIns: listOf(CHECK_IN),
      checkOuts: listOf(CHECK_OUT),
      bookings: bookingsMade.map(r => ({ ...bookingRow(r), at: r.createdAt })),
      payments: payments.map(p => ({ paymentId: p.paymentId, amount: money(p.amount), method: p.paymentMethod, at: p.paymentDate, ...bookingRow(p.reservation) })),
    },
  };
}
