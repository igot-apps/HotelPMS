import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createRoomType = async (data: {
  tenantId: number;
  propertyId: number;
  typeName: string;
  description?: string;
  basePrice: number;
  maxOccupancy: number;
  isActive?: boolean;
}) => {
  return prisma.roomType.create({
    data: {
      tenantId: data.tenantId,
      propertyId: data.propertyId,
      typeName: data.typeName,
      description: data.description,
      basePrice: data.basePrice,
      maxOccupancy: data.maxOccupancy || 1,
      isActive: data.isActive !== undefined ? data.isActive : true,
    },
  });
};

export const findRoomTypes = async (
  tenantId?: number,
  propertyId?: number,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  
  if (tenantId) where.tenantId = tenantId;
  if (propertyId) where.propertyId = propertyId;
  where.isActive = true;

  const [roomTypes, total] = await Promise.all([
    prisma.roomType.findMany({
      where,
      skip,
      take: limit,
      orderBy: { typeName: 'asc' },
      include: {
        property: {
          select: {
            propertyId: true,
            propertyName: true,
            propertyCode: true,
          },
        },
        _count: {
          select: {
            rooms: true,
            ratePlans: true,
          },
        },
      },
    }),
    prisma.roomType.count({ where }),
  ]);

  return { roomTypes, total, page, limit };
};

export const findRoomTypeById = async (roomTypeId: number) => {
  return prisma.roomType.findUnique({
    where: { roomTypeId },
    include: {
      property: {
        select: {
          propertyId: true,
          propertyName: true,
          propertyCode: true,
          tenantId: true,
        },
      },
      rooms: {
        include: {
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
      ratePlans: true,
      _count: {
        select: {
          rooms: true,
          ratePlans: true,
        },
      },
    },
  });
};

export const updateRoomType = async (
  roomTypeId: number,
  data: Partial<{
    typeName: string;
    description: string;
    basePrice: number;
    maxOccupancy: number;
    isActive: boolean;
  }>
) => {
  return prisma.roomType.update({
    where: { roomTypeId },
    data,
  });
};

export const deleteRoomType = async (roomTypeId: number) => {
  return prisma.roomType.update({
    where: { roomTypeId },
    data: { isActive: false },
  });
};

export const getRoomTypeStats = async (roomTypeId: number) => {
  const stats = await prisma.roomType.findUnique({
    where: { roomTypeId },
    include: {
      _count: {
        select: {
          rooms: true,
          ratePlans: true,
        },
      },
      rooms: {
        where: {
          operationalStatus: 'Available',
        },
        select: {
          roomId: true,
        },
      },
    },
  });

  if (!stats) return null;

  return {
    roomTypeId: stats.roomTypeId,
    typeName: stats.typeName,
    basePrice: stats.basePrice,
    maxOccupancy: stats.maxOccupancy,
    totalRooms: stats._count.rooms,
    availableRooms: stats.rooms.length,
    occupiedRooms: stats._count.rooms - stats.rooms.length,
    totalRatePlans: stats._count.ratePlans,
    isActive: stats.isActive,
  };
};