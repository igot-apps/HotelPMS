import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createRoom = async (data: {
  propertyId: number; // ✅ Removed tenantId
  roomNumber: string;
  roomTypeId: number;
  floor?: number;
  operationalStatus?: string;
  housekeepingStatus?: string;
  notes?: string;
}) => {
  return prisma.room.create({
    data: {
      propertyId: data.propertyId, // ✅ Removed tenantId
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
  propertyId?: number, // ✅ Removed tenantId
  roomTypeId?: number,
  operationalStatus?: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  
  if (propertyId) where.propertyId = propertyId; // ✅ Removed tenantId check
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
                    in: ['Confirmed', 'CheckedIn'],
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
          // ✅ Removed tenantId from select
        },
      },
      reservationRooms: {
        where: {
          reservation: {
            status: {
              in: ['Confirmed', 'CheckedIn'],
            },
          },
        },
        include: {
          reservation: {
            select: {
              reservationId: true,
              guestId: true,
              guest: {
                select: {
                  fullName: true,
                  email: true,
                  phone: true,
                },
              },
              checkInDate: true,
              checkOutDate: true,
            },
          },
        },
      },
    },
  });
};

// 🚨 THIS IS THE FUNCTION THAT FIXES YOUR TYPESCRIPT ERROR!
export const findAvailableRooms = async (
  propertyId: number, // ✅ Removed tenantId (Now the 1st argument)
  checkInDate: Date,
  checkOutDate: Date,
  roomTypeId?: number
) => {
  return prisma.room.findMany({
    where: {
      propertyId, // ✅ Removed tenantId
      operationalStatus: {
        not: 'Maintenance',
      },
      ...(roomTypeId && { roomTypeId }),
      reservationRooms: {
        none: {
          reservation: {
            status: {
              in: ['Confirmed', 'CheckedIn'],
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
    operationalStatus: string;
    housekeepingStatus: string;
    notes: string;
  }>
) => {
  return prisma.room.update({
    where: { roomId },
    data,
    include: {
      roomType: true,
    },
  });
};

export const updateRoomStatus = async (
  roomId: number,
  operationalStatus: string,
  housekeepingStatus?: string
) => {
  const data: any = { operationalStatus };
  if (housekeepingStatus) data.housekeepingStatus = housekeepingStatus;

  return prisma.room.update({
    where: { roomId },
    data,
  });
};

export const deleteRoom = async (roomId: number) => {
  return prisma.room.update({
    where: { roomId },
    data: { operationalStatus: 'OutOfService' },
  });
};