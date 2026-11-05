import { prisma } from '../../shared/utils/prisma';
import { recordSimulatedSms } from '../notifications/simulated-sms.service';

export async function cancelGuestReservation(reservationId: string, guestId: number, suppliedReason: unknown) {
  if (typeof suppliedReason !== 'string' || suppliedReason.trim().length < 5 || suppliedReason.trim().length > 500) throw new Error('Select a reason or enter 5 to 500 characters.');
  const reason = suppliedReason.trim();
  let wasConfirmed = false;
  const result = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<any[]>`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${reservationId} AND "platformGuestId" = ${guestId} AND source = 'Website' FOR UPDATE`;
    if (!rows.length) throw Object.assign(new Error('Reservation not found.'), { statusCode: 404 });
    const booking = await tx.reservation.findUniqueOrThrow({ where: { reservationId }, include: { reservationRooms: true, payments: true } });
    if (booking.status === 'Cancelled') return { reservationId, status: 'Cancelled', refundDue: Number(booking.refundDue) };
    if (!['Pending', 'Confirmed'].includes(booking.status) || booking.reservationRooms.some(r => r.status !== 'Reserved' || r.actualCheckIn)) throw new Error('Only reservations before check-in can be cancelled here. Contact the hotel for help with this stay.');
    wasConfirmed = booking.status === 'Confirmed';
    const paid = booking.payments.filter(p => p.status === 'Completed').reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0) / 100;
    if (Math.abs(paid - Number(booking.amountPaid)) > 0.01) throw new Error('This booking needs a payment review. Please contact the hotel to cancel.');
    // Release the allocation only. Another guest may physically occupy the same room today.
    await tx.reservationRoom.updateMany({ where: { reservationId, status: 'Reserved' }, data: { status: 'Cancelled' } });
    await tx.reservation.update({ where: { reservationId }, data: { status: 'Cancelled', cancellationDate: new Date(), refundDue: paid, refundStatus: paid > 0 ? 'Pending' : 'None' } });
    await tx.auditLog.create({ data: { entityType: 'Reservation', action: 'GuestCancelledReservation',
      oldData: { reservationId, status: booking.status },
      newData: { reservationId, propertyId: booking.propertyId, guestId, reason, status: 'Cancelled', refundDue: paid },
    } });
    return { reservationId, status: 'Cancelled', refundDue: paid };
  });
  if (wasConfirmed) await recordSimulatedSms(reservationId, 'cancelled');
  return result;
}
