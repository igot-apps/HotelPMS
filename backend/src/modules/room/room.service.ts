import * as roomRepository from './room.repository';

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
  return roomRepository.findRooms(
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