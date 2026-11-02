import { prisma } from '../../shared/utils/prisma';

export const ONLINE_HOLD_MINUTES = 15;
export function isExpiredOnlineHold(reservation: any, now = new Date()) {
  return ['Pending', 'Confirmed'].includes(reservation.status)
    && reservation.source === 'Website' && !reservation.staffId && reservation.platformGuestId != null
    && Number(reservation.amountPaid) === 0
    && new Date(reservation.createdAt).getTime() + ONLINE_HOLD_MINUTES * 60000 <= now.getTime();
}

export async function expireOnlineHolds(propertyId?: number) {
  const cutoff = new Date(Date.now() - ONLINE_HOLD_MINUTES * 60000);
  const where: any = {
    ...(propertyId ? { propertyId } : {}), source: 'Website', staffId: null,
    platformGuestId: { not: null }, status: { in: ['Pending', 'Confirmed'] }, amountPaid: 0,
    createdAt: { lte: cutoff }, payments: { none: { status: 'Completed', amount: { gt: 0 } } },
    reservationRooms: { none: { OR: [{ status: 'CheckedIn' }, { actualCheckIn: { not: null } }] } },
  };
  let expired = 0;
  // Small batches, including old unpaid website bookings created before this policy.
  const candidates = await prisma.reservation.findMany({ where, select: { reservationId: true }, take: 200, orderBy: { createdAt: 'asc' } });
  for (const candidate of candidates) {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${candidate.reservationId} FOR UPDATE`;
      const current = await tx.reservation.findFirst({ where: { ...where, reservationId: candidate.reservationId } });
      if (!current) return;
      await tx.reservationRoom.updateMany({ where: { reservationId: current.reservationId, status: 'Reserved' }, data: { status: 'Cancelled' } });
      await tx.reservation.update({ where: { reservationId: current.reservationId }, data: { status: 'Expired' } });
      await tx.auditLog.create({ data: { entityType: 'Reservation', action: 'OnlinePaymentHoldExpired',
        oldData: { reservationId: current.reservationId, status: current.status },
        newData: { reservationId: current.reservationId, reason: 'Online payment was not received within 15 minutes. Room allocation released.', status: 'Expired' },
      } });
      expired++;
    });
  }
  return expired;
}
