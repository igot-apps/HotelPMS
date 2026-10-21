import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createRoom = async (data: {
  propertyId: number;
  roomNumber: string;
  roomTypeId: number;
  floor?: number;
  operationalStatus?: any; // 🌟 Changed to 'any' to safely accept Prisma Enum or string
  housekeepingStatus?: any; // 🌟 Changed to 'any' to safely accept Prisma Enum or string
  notes?: string;
}) => {
  return prisma.room.create({
    data: {
      propertyId: data.propertyId,
      roomNumber: data.roomNumber,
      roomTypeId: data.roomTypeId,
      floor: data.floor,
      operationalStatus: data.operationalStatus || 'Available',
      housekeepingStatus: data.housekeepingStatus || 'Clean',
      notes: data.notes,
    },
    include: {
      roomType: true,
      property: {
        select: {
          propertyId: true,
          propertyName: true,
          propertyCode: true,
        },
      },
    },
  });
};

export const findRooms = async (
  propertyId?: number,
  roomTypeId?: number,
  operationalStatus?: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  
  if (propertyId) where.propertyId = propertyId;
  if (roomTypeId) where.roomTypeId = roomTypeId;
  if (operationalStatus) where.operationalStatus = operationalStatus;

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
      include: {
        roomType: true,
        property: {
          select: {
            propertyId: true,
            propertyName: true,
            propertyCode: true,
          },
        },
        _count: {
          select: {
            reservationRooms: {
              where: {
                reservation: {
                  status: {
                    in: ['Confirmed', 'InHouse'],
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.room.count({ where }),
  ]);

  return { rooms, total, page, limit };
};

export const findRoomById = async (roomId: number) => {
  return prisma.room.findUnique({
    where: { roomId },
    include: {
      roomType: true,
      property: {
        select: {
          propertyId: true,
          propertyName: true,
          propertyCode: true,
        },
      },
      reservationRooms: {
        where: {
          reservation: {
            status: {
              in: ['Confirmed', 'InHouse'] // 🌟 CHANGED to InHouse,
            },
          },
        },
        include: {
          reservation: {
            select: {
              reservationId: true,
              platformGuestId: true, // 🌟 Updated to match schema
              propertyGuestId: true, // 🌟 Updated to match schema
              checkInDate: true,
              checkOutDate: true,
            },
          },
        },
      },
    },
  });
};

export const findAvailableRooms = async (
  propertyId: number,
  checkInDate: Date,
  checkOutDate: Date,
  roomTypeId?: number
) => {
  return prisma.room.findMany({
    where: {
      propertyId,
      operationalStatus: {
        not: 'Maintenance', 
      },
      ...(roomTypeId && { roomTypeId }),
      reservationRooms: {
        none: {
          reservation: {
            status: {
              in: ['Confirmed', 'InHouse'] // ✅ CORRECT: Only one 'status'
            },
          },
          checkInDate: {
            lt: checkOutDate,
          },
          checkOutDate: {
            gt: checkInDate,
          },
        },
      },
    },
    include: {
      roomType: true,
    },
  });
};

export const updateRoom = async (
  roomId: number,
  data: Partial<{
    roomNumber: string;
    roomTypeId: number;
    floor: number;
    operationalStatus: any; // 🌟 Changed to 'any'
    housekeepingStatus: any; // 🌟 Changed to 'any'
    notes: string;
  }>
) => {
  return prisma.room.update({
    where: { roomId },
    data: data as any, // 🌟 Cast to 'any' to satisfy Prisma's strict enum typing
    include: {
      roomType: true,
    },
  });
};

export const updateRoomStatus = async (
  roomId: number,
  operationalStatus: any,
  housekeepingStatus?: any
) => {
  const data: any = { operationalStatus };
  if (housekeepingStatus) data.housekeepingStatus = housekeepingStatus;
  
  return prisma.room.update({
    where: { roomId },
    data,
  });
};

// 🌟 SOFT DELETE: Deactivates the room (used by other parts of the app)
export const deleteRoom = async (roomId: number) => {
  return prisma.room.update({
    where: { roomId },
    data: { operationalStatus: 'Maintenance' },
  });
};

// 🌟 HARD DELETE: Permanently removes the room (used only by Room Management)
export const hardDeleteRoom = async (roomId: number) => {
  return prisma.room.delete({
    where: { roomId },
  });
};