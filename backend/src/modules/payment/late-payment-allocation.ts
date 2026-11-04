// Called inside the serializable settlement transaction. Booking creation uses
// the same room locks, so availability cannot change between checking and saving.
export async function restoreLatePaymentAllocation(tx: any, booking: any): Promise<boolean> {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  if (booking.source !== 'Website' || new Date(booking.checkInDate) < today) return false;
  // A booking with money already returned must stay released for refund review.
  if (await tx.refund.count({ where: { reservationId: booking.reservationId } })) return false;
  const hotel = await tx.property.findUnique({ where: { propertyId: booking.propertyId } });
  if (!hotel?.isActive || hotel.status !== 'Active' || !hotel.isOnlineBookingEnabled) return false;
  const stays = await tx.reservationRoom.findMany({ where: { reservationId: booking.reservationId }, orderBy: { reservationRoomId: 'asc' } });
  if (!stays.length || stays.some((s: any) => !s.roomTypeId || s.actualCheckIn || !['Reserved', 'Cancelled'].includes(s.status))) return false;
  await tx.$queryRaw`SELECT "roomId" FROM rooms WHERE "propertyId" = ${booking.propertyId} ORDER BY "roomId" FOR UPDATE`;
  const rooms = await tx.room.findMany({ where: { propertyId: booking.propertyId, operationalStatus: 'Available', roomType: { isActive: true } }, orderBy: { roomId: 'asc' } });
  const selections: any[] = [];
  for (const stay of stays) {
    const candidates = rooms.filter((r: any) => r.roomTypeId === stay.roomTypeId && !selections.some(s => s.room.roomId === r.roomId));
    candidates.sort((a: any, b: any) => Number(b.roomId === stay.roomId) - Number(a.roomId === stay.roomId));
    let selected;
    for (const room of candidates) {
      const conflict = await tx.reservationRoom.findFirst({ where: {
        roomId: room.roomId, reservationId: { not: booking.reservationId }, status: { in: ['Reserved', 'CheckedIn'] },
        reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } },
        checkInDate: { lt: stay.checkOutDate }, checkOutDate: { gt: stay.checkInDate },
      } });
      if (!conflict) { selected = room; break; }
    }
    if (!selected) return false;
    selections.push({ stay, room: selected });
  }
  // Clear old IDs first to support reassignment without unique-key collisions.
  await tx.reservationRoom.updateMany({ where: { reservationId: booking.reservationId }, data: { roomId: null } });
  for (const { stay, room } of selections) await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { roomId: room.roomId, roomNumberSnapshot: room.roomNumber, status: 'Reserved' } });
  await tx.auditLog.create({ data: { entityType: 'Reservation', action: 'LatePaymentBookingConfirmed',
    oldData: { reservationId: booking.reservationId, status: booking.status },
    newData: { reservationId: booking.reservationId, status: 'Confirmed', reason: 'Late payment received; availability rechecked and room allocation restored.', roomIds: selections.map(s => s.room.roomId) },
  } });
  return true;
}
