import { assertCapacity } from '../payment/subscription-access';
import * as roomTypeRepository from './room-type.repository';

export const createRoomType = async (data: {
  propertyId: number;
  typeName: string;
  description?: string;
  basePrice: number;
  maxOccupancy: number;
  isActive?: boolean;
  amenityIds?: number[]; // 🌟 NEW
}) => {
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.typeName) throw new Error('Room type name is required');
  if (!data.basePrice) throw new Error('Base price is required');
  
  return roomTypeRepository.createRoomType(data);
};

export const getRoomTypes = async (
  propertyId?: number,
  page: number = 1,
  limit: number = 10
) => {
  return roomTypeRepository.findRoomTypes(propertyId, page, limit);
};

export const getRoomTypeById = async (roomTypeId: number) => {
  const roomType = await roomTypeRepository.findRoomTypeById(roomTypeId);
  if (!roomType) throw new Error('Room type not found');
  return roomType;
};

export const getRoomTypeStats = async (roomTypeId: number) => {
  const stats = await roomTypeRepository.getRoomTypeStats(roomTypeId);
  if (!stats) throw new Error('Room type not found');
  return stats;
};

export const updateRoomType = async (
  roomTypeId: number, 
  data: Partial<{
    typeName: string;
    description: string;
    basePrice: number;
    maxOccupancy: number;
    isActive: boolean;
    amenityIds: number[]; // 🌟 NEW
  }>
) => {
  const roomType = await roomTypeRepository.findRoomTypeById(roomTypeId);
  if (!roomType) throw new Error('Room type not found');
  if (data.isActive === true && !roomType.isActive) {
    // Reactivating a type brings its rooms back into the plan's room count.
    const returning = roomType.rooms.filter((r: any) => !(r.operationalStatus === 'Maintenance' && r.maintenanceReason === 'Room deactivated')).length;
    await assertCapacity(roomType.propertyId, 'rooms', returning);
  }

  return roomTypeRepository.updateRoomType(roomTypeId, data);
};

export const deleteRoomType = async (roomTypeId: number) => {
  const roomType = await roomTypeRepository.findRoomTypeById(roomTypeId);
  if (!roomType) throw new Error('Room type not found');
  
  return roomTypeRepository.deleteRoomType(roomTypeId);
};

// 🌟 NEW: Hard Delete Room Type
export const hardDeleteRoomType = async (roomTypeId: number) => {
  return roomTypeRepository.hardDeleteRoomType(roomTypeId);
};
