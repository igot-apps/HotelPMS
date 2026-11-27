import * as roomRepository from './room.repository';
import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';
import { expireUnarrivedStays } from '../reservation/recovery.service';
import { assertCapacity } from '../payment/subscription-access';
import { notifyMaintenanceResolved } from '../notifications/housekeeping-alerts';

const isDeactivated = (room: { operationalStatus: string; maintenanceReason: string | null }) =>
  room.operationalStatus === 'Maintenance' && room.maintenanceReason === 'Room deactivated';

// A room starts counting against the plan when it leaves the deactivated state or moves to an active room type.
const assertRoomReactivation = async (room: any, nextStatus?: string, nextRoomTypeId?: number) => {
  const wasCounted = !isDeactivated(room) && room.roomType?.isActive !== false;
  if (wasCounted) return;
  const leavesDeactivated = !isDeactivated(room) || (!!nextStatus && nextStatus !== 'Maintenance');
  const nextType = nextRoomTypeId && nextRoomTypeId !== room.roomTypeId
    ? await prisma.roomType.findUnique({ where: { roomTypeId: nextRoomTypeId }, select: { isActive: true } })
    : room.roomType;
  if (leavesDeactivated && nextType?.isActive !== false) await assertCapacity(room.propertyId, 'rooms');
};



export const createRoom = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.roomNumber) throw new Error('Room number is required');
  if (!data.roomTypeId) throw new Error('Room type ID is required');
  await assertCapacity(Number(data.propertyId), 'rooms');

  return roomRepository.createRoom(data);
};

export const getRooms = async (
  propertyId?: number, // ✅ Removed tenantId
  roomTypeId?: number,
  operationalStatus?: string,
  page: number = 1,
  limit: number = 10
) => {
  if (propertyId) await expireUnarrivedStays(propertyId);
  const result: any = await roomRepository.findRooms(
    propertyId,
    roomTypeId,
    operationalStatus,
    page,
    limit
  );
  // A clean empty room can still be booked for a guest arriving today. Show that on the room so staff
  // do not give it to someone else (housekeeping readiness is not the same as free for tonight).
  if (propertyId && result.rooms?.length) {
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { timezone: true } });
    const today = new Date(`${hotelDate(new Date(), property?.timezone || 'Africa/Accra')}T00:00:00Z`);
    const arriving = await prisma.reservationRoom.findMany({
      where: { roomId: { in: result.rooms.map((room: any) => room.roomId) }, status: 'Reserved', reservation: { status: { in: ['Confirmed', 'InHouse'] } }, checkInDate: { lte: today }, checkOutDate: { gt: today } },
      orderBy: { checkInDate: 'asc' },
      select: { roomId: true, checkInDate: true, occupantName: true, reservation: { select: { reservationId: true, confirmationCode: true, guestNameSnapshot: true, platformGuest: { select: { fullName: true } }, propertyGuest: { select: { fullName: true } } } } },
    });
    for (const room of result.rooms) {
      const stay = arriving.find(a => a.roomId === room.roomId);
      room.arrivingToday = stay ? { reservationId: stay.reservation.reservationId, confirmationCode: stay.reservation.confirmationCode, checkInDate: stay.checkInDate,
        guestName: stay.occupantName || stay.reservation.guestNameSnapshot || stay.reservation.platformGuest?.fullName || stay.reservation.propertyGuest?.fullName || 'Guest' } : null;
    }
  }
  return result;
};

export const getRoomById = async (roomId: number) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  return room;
};

export const getAvailableRooms = async (
  propertyId: number, // ✅ Removed tenantId
  checkInDate: string,
  checkOutDate: string,
  roomTypeId?: number
) => {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  
  if (checkIn >= checkOut) {
    throw new Error('Arrival date must be before departure date');
  }
  
  return roomRepository.findAvailableRooms(
    propertyId,
    checkIn,
    checkOut,
    roomTypeId
  );
};

export const updateRoom = async (roomId: number, data: any) => {
  if (data.housekeepingStatus === 'OutOfService') {
    data.operationalStatus = 'Maintenance';
  }
  
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  const { maintenanceReason, isOnlineBookable: _ignored, ...fields } = data;
  await assertRoomReactivation(room, fields.operationalStatus, fields.roomTypeId ? Number(fields.roomTypeId) : undefined);
  Object.assign(fields, maintenanceReasonUpdate(room.operationalStatus, fields.operationalStatus, maintenanceReason));

  return roomRepository.updateRoom(roomId, fields);
};

// Entering maintenance needs a reason; leaving it clears the reason.
export const maintenanceReasonUpdate = (currentStatus: string, nextStatus: string | undefined, reason: unknown) => {
  if (!nextStatus) return {};
  if (nextStatus !== 'Maintenance') return currentStatus === 'Maintenance' ? { maintenanceReason: null } : {};
  if (currentStatus === 'Maintenance' && reason === undefined) return {};
  const text = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
  if (text.length < 3 || text.length > 200) throw new Error('Choose or enter a maintenance reason (3 to 200 characters).');
  return { maintenanceReason: text };
};

export const updateRoomStatus = async (
  roomId: number,
  operationalStatus: string,
  housekeepingStatus?: string,
  maintenanceReason?: unknown,
  actor?: { userId: number; propertyId: number },
) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  const reasonUpdate = maintenanceReasonUpdate(room.operationalStatus, operationalStatus, maintenanceReason);
  await assertRoomReactivation(room, operationalStatus);

  if (operationalStatus === 'Maintenance') {
    const checkedInStay = await roomRepository.findActiveCheckedInReservationRoom(roomId);
    if (checkedInStay) {
      const occupant = checkedInStay.occupantName
        || checkedInStay.reservation.guestNameSnapshot
        || checkedInStay.reservation.propertyGuest?.fullName
        || checkedInStay.reservation.platformGuest?.fullName
        || 'the current guest';
      throw new Error(`Room ${room.roomNumber} is occupied by ${occupant}. Check the guest out before setting the room to maintenance.`);
    }
  }

  const updated = await roomRepository.updateRoomStatus(roomId, operationalStatus, housekeepingStatus, reasonUpdate);
  // Same Activity Log entry as the housekeeping screen, so every cleaning change is traceable.
  if (actor && housekeepingStatus && housekeepingStatus !== room.housekeepingStatus) {
    await prisma.auditLog.create({ data: { propertyId: room.propertyId, userId: actor.userId, entityType: 'Room', action: 'HousekeepingStatusChanged', oldData: { roomId, status: room.housekeepingStatus }, newData: { roomId, propertyId: room.propertyId, status: housekeepingStatus } } })
      .catch((error: any) => console.warn('Could not record cleaning status change', { roomId, error: error?.message }));
  }
  if (room.operationalStatus === 'Maintenance' && operationalStatus === 'Available') void notifyMaintenanceResolved(roomId);
  return updated;
};

// 🌟 SOFT DELETE: Deactivates the room
export const deleteRoom = async (roomId: number) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  
  return roomRepository.deleteRoom(roomId);
};

// 🌟 HARD DELETE: Permanently removes the room
export const hardDeleteRoom = async (roomId: number) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  
  return roomRepository.hardDeleteRoom(roomId);
};
