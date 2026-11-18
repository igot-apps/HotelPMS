import { prisma } from '../../shared/utils/prisma';

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const CREDIT_ACTIONS = ['CreditCheckoutApproved', 'Correction:credit-checkout'];

// Guests who have checked out but still owe money. The debt is read straight from the booking
// (total minus paid), so a payment recorded later removes the booking from this list on its own.
export async function getOwedAfterCheckout(propertyId: number) {
  const owing = await prisma.$queryRaw<{ reservationId: string }[]>`
    SELECT "reservationId" FROM reservations
    WHERE "propertyId" = ${propertyId} AND status = 'Completed'
      AND COALESCE("totalAmount", 0) - COALESCE("amountPaid", 0) > 0.009`;
  const ids = owing.map(row => row.reservationId);
  if (!ids.length) return { total: 0, bookings: [] };

  const [reservations, approvals] = await Promise.all([
    prisma.reservation.findMany({
      where: { reservationId: { in: ids }, propertyId },
      select: {
        reservationId: true, confirmationCode: true, guestNameSnapshot: true, guestPhoneSnapshot: true, totalAmount: true, amountPaid: true,
        platformGuest: { select: { fullName: true } }, propertyGuest: { select: { fullName: true } },
        reservationRooms: { select: { roomNumberSnapshot: true, actualCheckOut: true, room: { select: { roomNumber: true } } } },
      },
    }),
    prisma.auditLog.findMany({
      where: { entityType: 'Reservation', action: { in: CREDIT_ACTIONS }, OR: ids.map(id => ({ newData: { path: ['reservationId'], equals: id } })) },
      select: { newData: true, createdAt: true, user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Most recent approval per booking (audits are newest first).
  const approvalFor = new Map<string, any>();
  for (const entry of approvals) {
    const data = entry.newData as any;
    if (data?.reservationId && !approvalFor.has(data.reservationId)) approvalFor.set(data.reservationId, { reason: data.reason || null, approvedBy: entry.user?.fullName || null, approvedAt: entry.createdAt });
  }

  const bookings = reservations.map(res => {
    const departures = res.reservationRooms.map(r => r.actualCheckOut).filter(Boolean) as Date[];
    const approval = approvalFor.get(res.reservationId);
    return {
      reservationId: res.reservationId,
      confirmationCode: res.confirmationCode,
      guestName: res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Guest',
      guestPhone: res.guestPhoneSnapshot || null,
      roomNumbers: res.reservationRooms.map(r => r.room?.roomNumber || r.roomNumberSnapshot).filter(Boolean),
      checkedOutAt: departures.length ? new Date(Math.max(...departures.map(d => d.getTime()))) : null,
      totalAmount: money(res.totalAmount),
      amountPaid: money(res.amountPaid),
      balanceDue: money(Number(res.totalAmount || 0) - Number(res.amountPaid || 0)),
      reason: approval?.reason || null,
      approvedBy: approval?.approvedBy || null,
    };
  }).filter(b => b.balanceDue > 0).sort((a, b) => (b.checkedOutAt?.getTime() || 0) - (a.checkedOutAt?.getTime() || 0));

  return { total: money(bookings.reduce((sum, b) => sum + b.balanceDue, 0)), bookings };
}
