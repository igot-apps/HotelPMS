import * as roomRepository from './room.repository';
import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';



export const createRoom = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.roomNumber) throw new Error('Room number is required');
  if (!data.roomTypeId) throw new Error('Room type ID is required');
  
  return roomRepository.createRoom(data);
};

export const getRooms = async (
  propertyId?: number, // ✅ Removed tenantId
  roomTypeId?: number,
  operationalStatus?: string,
  page: number = 1,
  limit: number = 10
) => {
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
    throw new Error('Check-in date must be before check-out date');
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
) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  const reasonUpdate = maintenanceReasonUpdate(room.operationalStatus, operationalStatus, maintenanceReason);

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
  
  return roomRepository.updateRoomStatus(roomId, operationalStatus, housekeepingStatus, reasonUpdate);
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
