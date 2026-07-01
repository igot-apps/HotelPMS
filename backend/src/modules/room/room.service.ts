import * as roomRepository from './room.repository';

export const createRoom = async (data: any) => {
  if (!data.tenantId) throw new Error('Tenant ID is required');
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.roomNumber) throw new Error('Room number is required');
  if (!data.roomTypeId) throw new Error('Room type ID is required');

  return roomRepository.createRoom(data);
};

export const getRooms = async (
  tenantId?: number,
  propertyId?: number,
  roomTypeId?: number,
  operationalStatus?: string,
  page: number = 1,
  limit: number = 10
) => {
  return roomRepository.findRooms(
    tenantId,
    propertyId,
    roomTypeId,
    operationalStatus,
    page,
    limit
  );
};

export const getRoomById = async (roomId: number) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  return room;
};

export const getAvailableRooms = async (
  tenantId: number,
  propertyId: number,
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
    tenantId,
    propertyId,
    checkIn,
    checkOut,
    roomTypeId
  );
};

export const updateRoom = async (roomId: number, data: any) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  return roomRepository.updateRoom(roomId, data);
};

export const updateRoomStatus = async (
  roomId: number,
  operationalStatus: string,
  housekeepingStatus?: string
) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  return roomRepository.updateRoomStatus(roomId, operationalStatus, housekeepingStatus);
};

export const deleteRoom = async (roomId: number) => {
  const room = await roomRepository.findRoomById(roomId);
  if (!room) throw new Error('Room not found');
  return roomRepository.deleteRoom(roomId);
};