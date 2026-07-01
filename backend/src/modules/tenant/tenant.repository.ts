import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createTenant = async (data: {
  tenantCode: string;
  businessName: string;
  legalName?: string;
  subscriptionPlan?: string;
  currency?: string;
  timezone?: string;
  country: string;
  primaryEmail?: string;
  primaryPhone?: string;
}) => {
  return prisma.tenant.create({
    data: {
      tenantCode: data.tenantCode,
      businessName: data.businessName,
      legalName: data.legalName,
      subscriptionPlan: data.subscriptionPlan || 'Starter',
      currency: data.currency || 'GHS',
      timezone: data.timezone || 'Africa/Accra',
      country: data.country,
      primaryEmail: data.primaryEmail,
      primaryPhone: data.primaryPhone,
      isActive: true,
    },
  });
};

export const findTenants = async (page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      skip,
      take: limit,
      orderBy: { createdDate: 'desc' },
      include: {
        _count: {
          select: {
            properties: true,
            users: true,
            guests: true,
          },
        },
      },
    }),
    prisma.tenant.count(),
  ]);

  return { tenants, total, page, limit };
};

export const findTenantById = async (tenantId: number) => {
  return prisma.tenant.findUnique({
    where: { tenantId },
    include: {
      properties: true,
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
          properties: true,
          users: true,
          guests: true,
          rooms: true,
          reservations: true,
        },
      },
    },
  });
};

export const findTenantByCode = async (tenantCode: string) => {
  return prisma.tenant.findUnique({
    where: { tenantCode },
  });
};

export const updateTenant = async (
  tenantId: number,
  data: Partial<{
    businessName: string;
    legalName: string;
    subscriptionPlan: string;
    subscriptionStatus: string;
    currency: string;
    timezone: string;
    country: string;
    logo: string;
    primaryEmail: string;
    primaryPhone: string;
    isActive: boolean;
  }>
) => {
  return prisma.tenant.update({
    where: { tenantId },
    data,
  });
};

export const deleteTenant = async (tenantId: number) => {
  return prisma.tenant.update({
    where: { tenantId },
    data: { isActive: false },
  });
};

export const getTenantStats = async (tenantId: number) => {
  const stats = await prisma.tenant.findUnique({
    where: { tenantId },
    include: {
      _count: {
        select: {
          properties: true,
          users: true,
          guests: true,
          rooms: true,
          reservations: true,
          payments: true,
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
      payments: {
        select: {
          amount: true,
        },
      },
    },
  });

  if (!stats) return null;

  // ✅ FIX: Convert Decimal to number before summing
  const totalRevenue = stats.payments.reduce((sum, p) => {
    // Convert Prisma Decimal to number
    const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
    return sum + amount;
  }, 0);

  const currentOccupancy = stats.reservations.length;

  return {
    tenantId: stats.tenantId,
    businessName: stats.businessName,
    totalProperties: stats._count.properties,
    totalUsers: stats._count.users,
    totalGuests: stats._count.guests,
    totalRooms: stats._count.rooms,
    totalReservations: stats._count.reservations,
    currentOccupancy,
    totalPayments: stats._count.payments,
    totalRevenue,
    subscriptionPlan: stats.subscriptionPlan,
    subscriptionStatus: stats.subscriptionStatus,
  };
};