import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';

// Allocation shares SERIALIZABLE transactions and room locks with recovery actions.
export async function createHotelReservation(input: any, online = false): Promise<any> {
  const from = new Date(input.checkInDate), to = new Date(input.checkOutDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('Valid arrival and departure dates are required.');
  from.setUTCHours(0, 0, 0, 0); to.setUTCHours(0, 0, 0, 0);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  if (from < today || to <= from) throw new Error('Arrival cannot be in the past and departure must be after arrival.');
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const property = await tx.property.findUnique({ where: { propertyId: Number(input.propertyId) } });
        if (!property || !property.isActive || property.status !== 'Active') throw new Error('Hotel is not active.');
        const guest = input.propertyGuestId
          ? await tx.propertyGuest.findFirst({ where: { guestId: Number(input.propertyGuestId), propertyId: property.propertyId, isActive: true } })
          : await tx.platformGuest.findFirst({ where: { guestId: Number(input.platformGuestId), isActive: true } });
        if (!guest) throw new Error('Guest not found for this booking.');
        const overlapping = { reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] as any[] } }, status: { in: ['Reserved', 'CheckedIn'] }, checkInDate: { lt: to }, checkOutDate: { gt: from } };
        let selections = input.rooms;
        if (online) {
          if (!property.isOnlineBookingEnabled) throw new Error('Online booking is disabled.');
          const candidate = await tx.room.findFirst({ where: { propertyId: property.propertyId, roomTypeId: Number(input.roomTypeId), roomType: { isActive: true }, operationalStatus: 'Available', reservationRooms: { none: overlapping } }, orderBy: { roomId: 'asc' }, include: { roomType: true } });
          if (!candidate) throw new Error('No room is available for the selected dates.');
          selections = [{ roomId: candidate.roomId, roomTypeId: candidate.roomTypeId, agreedPricePerNight: Number(candidate.roomType.basePrice) }];
        }
        if (!Array.isArray(selections) || !selections.length || new Set(selections.map((r: any) => r.roomId)).size !== selections.length) throw new Error('Choose one or more distinct rooms.');
        const allocations: any[] = [];
        for (const selected of [...selections].sort((a, b) => a.roomId - b.roomId)) {
          await tx.$queryRaw`SELECT "roomId" FROM rooms WHERE "roomId" = ${Number(selected.roomId)} FOR UPDATE`;
          const room = await tx.room.findFirst({ where: { roomId: Number(selected.roomId), propertyId: property.propertyId, roomTypeId: Number(selected.roomTypeId), roomType: { isActive: true }, operationalStatus: { not: 'Maintenance' }, reservationRooms: { none: overlapping } }, include: { roomType: true } });
          if (!room) throw new Error('A selected room is no longer available. Refresh availability.');
          const rate = Number(selected.agreedPricePerNight);
          if (!Number.isFinite(rate) || rate <= 0 || Math.round(rate * 100) / 100 !== rate) throw new Error('Room price must be a positive amount with at most two decimal places.');
          if (selected.ratePlanId) {
            const plan = await tx.ratePlan.findFirst({ where: { ratePlanId: Number(selected.ratePlanId), propertyId: property.propertyId, roomTypeId: room.roomTypeId, isActive: true } });
            if (!plan) throw new Error('Rate plan is not valid for this room.');
          }
          allocations.push({ roomId: room.roomId, roomTypeId: room.roomTypeId, ratePlanId: selected.ratePlanId || null, checkInDate: from, checkOutDate: to, agreedPricePerNight: rate, roomNumberSnapshot: room.roomNumber, roomTypeNameSnapshot: room.roomType.typeName });
        }
        const nights = (to.getTime() - from.getTime()) / 86400000;
        const subtotal = allocations.reduce((sum, r) => sum + r.agreedPricePerNight * nights, 0);
        return tx.reservation.create({ data: {
          propertyId: property.propertyId, propertyGuestId: input.propertyGuestId ? Number(input.propertyGuestId) : null,
          platformGuestId: input.propertyGuestId ? null : Number(input.platformGuestId), staffId: input.staffId,
          source: input.source || 'WalkIn', checkInDate: from, checkOutDate: to, status: 'Confirmed', notes: input.notes || '',
          guestNameSnapshot: guest.fullName, guestPhoneSnapshot: guest.phone,
          totalAmount: Math.round(subtotal * (online ? 1 + Number(property.taxPercentage) / 100 : 1) * 100) / 100,
          amountPaid: 0, confirmationCode: `RES-${randomUUID().slice(0, 12).toUpperCase()}`,
          reservationRooms: { create: allocations },
        }, include: { reservationRooms: { include: { room: { include: { roomType: true } } } }, propertyGuest: true, platformGuest: { select: { fullName: true, phone: true, email: true } } } });
      }, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error: any) { if ((error.code !== 'P2034' && error.meta?.code !== '40001') || attempt >= 2) throw error; }
  }
}
