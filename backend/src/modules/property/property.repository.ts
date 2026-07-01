import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createProperty = async (data: {
  tenantId: number;
  propertyName: string;
  propertyCode: string;
  propertyType: string;
  address?: string;
  city?: string;
  country?: string;
  gpsCoordinates?: string;
  totalRooms?: number;
  checkInTime?: string;
  checkOutTime?: string;
  status?: string;
}) => {
  return prisma.property.create({
    data: {
      tenantId: data.tenantId,
      propertyName: data.propertyName,
      propertyCode: data.propertyCode,
      propertyType: data.propertyType,
      address: data.address,
      city: data.city,
      country: data.country,
      gpsCoordinates: data.gpsCoordinates,
      totalRooms: data.totalRooms || 0,
      checkInTime: data.checkInTime || '14:00',
      checkOutTime: data.checkOutTime || '11:00',
      status: data.status || 'Active',
    },
  });
};

export const findProperties = async (
  tenantId?: number,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where = tenantId ? { tenantId } : {};

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            tenantId: true,
            businessName: true,
            tenantCode: true,
          },
        },
        _count: {
          select: {
            rooms: true,
            users: true,
            reservations: true,
          },
        },
      },
    }),
    prisma.property.count({ where }),
  ]);

  return { properties, total, page, limit };
};

export const findPropertyById = async (propertyId: number) => {
  return prisma.property.findUnique({
    where: { propertyId },
    include: {
      tenant: {
        select: {
          tenantId: true,
          businessName: true,
          tenantCode: true,
        },
      },
      rooms: {
        include: {
          roomType: true,
        },
      },
      roomTypes: true,
      users: {
        select: {
          userId: true,
          fullName: true,
          username: true,
          email: true,
          role: true,
        },
      },
      _count: {
        select: {
          rooms: true,
          users: true,
          reservations: true,
        },
      },
    },
  });
};

export const findPropertiesByTenant = async (tenantId: number) => {
  return prisma.property.findMany({
    where: { tenantId, status: 'Active' },
    include: {
      _count: {
        select: {
          rooms: true,
          users: true,
          reservations: true,
        },
      },
    },
    orderBy: { propertyName: 'asc' },
  });
};

export const updateProperty = async (
  propertyId: number,
  data: Partial<{
    propertyName: string;
    propertyCode: string;
    propertyType: string;
    address: string;
    city: string;
    country: string;
    gpsCoordinates: string;
    totalRooms: number;
    checkInTime: string;
    checkOutTime: string;
    status: string;
  }>
) => {
  return prisma.property.update({
    where: { propertyId },
    data,
  });
};

export const deleteProperty = async (propertyId: number) => {
  return prisma.property.update({
    where: { propertyId },
    data: { status: 'Inactive' },
  });
};

export const getPropertyStats = async (propertyId: number) => {
  const stats = await prisma.property.findUnique({
    where: { propertyId },
    include: {
      _count: {
        select: {
          rooms: true,
          users: true,
          reservations: true,
        },
      },
      rooms: {
        where: {
          operationalStatus: 'Occupied',
        },
        select: {
          roomId: true,
        },
      },
      reservations: {
        where: {
          status: 'CheckedIn',
        },
        select: {
          reservationId: true,
        },
      },
    },
  });

  if (!stats) return null;

  return {
    propertyId: stats.propertyId,
    propertyName: stats.propertyName,
    totalRooms: stats._count.rooms,
    occupiedRooms: stats.rooms.length,
    availableRooms: stats._count.rooms - stats.rooms.length,
    totalUsers: stats._count.users,
    totalReservations: stats._count.reservations,
    currentOccupancy: stats.reservations.length,
    occupancyRate: stats._count.rooms > 0 
      ? (stats.rooms.length / stats._count.rooms) * 100 
      : 0,
    status: stats.status,
  };
};