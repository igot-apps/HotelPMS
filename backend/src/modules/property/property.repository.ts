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

// Platform admin list: search, filter by state and sort. Counts always cover every hotel.
export const PLATFORM_STATES = ['active', 'inactive', 'trial', 'paid', 'expired'] as const;
export const PLATFORM_SORTS = ['newest', 'name', 'expiry'] as const;
const stateWhere = (state: string, now: Date): any => ({
  active: { status: 'Active', isActive: true },
  inactive: { OR: [{ status: { not: 'Active' } }, { isActive: false }] },
  trial: { subscriptionStatus: 'Trial', OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: now } }] },
  paid: { subscriptionStatus: 'Active', OR: [{ subscriptionEndsAt: null }, { subscriptionEndsAt: { gt: now } }] },
  expired: { OR: [{ subscriptionStatus: { in: ['Expired', 'Cancelled'] } }, { subscriptionStatus: 'Trial', trialEndsAt: { lte: now } }, { subscriptionStatus: 'Active', subscriptionEndsAt: { lte: now } }] },
} as any)[state] || {};

export const findPlatformProperties = async (page = 1, limit = 50, search = '', state = '', sort = 'newest') => {
  const skip = (page - 1) * limit;
  const term = search.trim();
  const now = new Date();
  const searchWhere = term ? {
    OR: [
      { propertyName: { contains: term, mode: 'insensitive' as const } },
      { propertyCode: { contains: term, mode: 'insensitive' as const } },
      { city: { contains: term, mode: 'insensitive' as const } },
      { country: { contains: term, mode: 'insensitive' as const } },
    ],
  } : {};
  const where = { AND: [searchWhere, stateWhere(state, now)] };
  const orderBy: any = sort === 'name' ? { propertyName: 'asc' }
    : sort === 'expiry' ? [{ subscriptionEndsAt: { sort: 'asc', nulls: 'last' } }, { trialEndsAt: { sort: 'asc', nulls: 'last' } }]
    : { createdAt: 'desc' };
  const count = (s: string) => prisma.property.count({ where: stateWhere(s, now) });

  const [properties, total, all, active, inactive, trials, paid, expired] = await Promise.all([
    prisma.property.findMany({ where, skip, take: limit, orderBy, include: { _count: { select: { rooms: true, users: true } } } }),
    prisma.property.count({ where }),
    prisma.property.count(),
    count('active'), count('inactive'), count('trial'), count('paid'), count('expired'),
  ]);

  return { properties, total, all, active, inactive, trials, paid, expired, page, limit };
};

export const reactivateProperty = async (propertyId: number) => prisma.property.update({ where: { propertyId }, data: { status: 'Active', isActive: true } });

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

export const permanentlyDeleteProperty = async (propertyId: number, confirmationCode: string) => {
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.findUnique({ where: { propertyId } });
    if (!property) throw new Error('Property not found.');
    if (confirmationCode !== property.propertyCode) {
      throw new Error('Enter the exact property code to confirm permanent deletion.');
    }

    // Remove restrictive references before cascading through hotel-owned records.
    await tx.payment.deleteMany({
      where: { OR: [{ propertyId }, { reservation: { propertyId } }] },
    });
    await tx.reservation.deleteMany({ where: { propertyId } });
    await tx.auditLog.deleteMany({ where: { user: { propertyId } } });
    return tx.property.delete({ where: { propertyId } });
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
