import { prisma } from '../../shared/utils/prisma';

// ✅ Changed data to 'any' to prevent TypeScript strict type errors on optional fields
export const createProperty = async (data: any) => {
  return prisma.property.create({
    data: {
      propertyCode: data.propertyCode,
      propertyName: data.propertyName,
      businessName: data.businessName || data.propertyName, 
      propertyType: data.propertyType || 'Hotel',
      address: data.address,
      city: data.city,
      country: data.country || 'Ghana', // ✅ Safely defaults to Ghana
      gpsCoordinates: data.gpsCoordinates,
      totalRooms: data.totalRooms || 0,
      checkInTime: data.checkInTime || '14:00',
      checkOutTime: data.checkOutTime || '11:00',
      status: data.status || 'Active',
      currency: data.currency || 'GHS',
      timezone: data.timezone || 'Africa/Accra',
      primaryEmail: data.primaryEmail,
      primaryPhone: data.primaryPhone,
      logo: data.logo,
    },
  });
};

export const findProperties = async (
  page: number = 1,
  limit: number = 10,
  propertyId?: number
) => {
  const skip = (page - 1) * limit;
  const where = propertyId === undefined ? {} : { propertyId };

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
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

export const findPlatformProperties = async (page = 1, limit = 50, search = '') => {
  const skip = (page - 1) * limit;
  const term = search.trim();
  const where = term ? {
    OR: [
      { propertyName: { contains: term, mode: 'insensitive' as const } },
      { propertyCode: { contains: term, mode: 'insensitive' as const } },
      { city: { contains: term, mode: 'insensitive' as const } },
      { country: { contains: term, mode: 'insensitive' as const } },
    ],
  } : {};

  const [properties, total, active, trials] = await Promise.all([
    prisma.property.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { rooms: true, users: true } } },
    }),
    prisma.property.count({ where }),
    prisma.property.count({ where: { status: 'Active', isActive: true } }),
    prisma.property.count({ where: { subscriptionStatus: 'Trial' } }),
  ]);

  return { properties, total, active, trials, page, limit };
};

export const findPropertyById = async (propertyId: number) => {
  return prisma.property.findUnique({
    where: { propertyId },
    include: {
      rooms: {
        include: { roomType: true },
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

export const findAllActiveProperties = async (propertyId?: number) => {
  return prisma.property.findMany({
    where: { status: 'Active', ...(propertyId === undefined ? {} : { propertyId }) },
    orderBy: { propertyName: 'asc' },
  });
};

export const updateProperty = async (
  propertyId: number,
  data: any
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
        where: { operationalStatus: 'Occupied' },
        select: { roomId: true },
      },
      // 🌟 CHANGED: 'CheckedIn' is now 'InHouse'
      reservations: {
        where: { status: 'InHouse' },
        select: { reservationId: true },
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
