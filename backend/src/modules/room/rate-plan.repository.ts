import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const createRatePlan = async (data: {
  propertyId: number; // ✅ Removed tenantId
  roomTypeId: number;
  planName: string;
  description?: string;
  isPublic?: boolean;
  minStay?: number;
  maxStay?: number;
  discountPercent?: number;
  isActive?: boolean;
}) => {
  return prisma.ratePlan.create({
    data: {
      propertyId: data.propertyId, // ✅ Removed tenantId
      roomTypeId: data.roomTypeId,
      planName: data.planName,
      description: data.description,
      isPublic: data.isPublic !== undefined ? data.isPublic : true,
      minStay: data.minStay || 1,
      maxStay: data.maxStay || 14,
      discountPercent: data.discountPercent,
      isActive: data.isActive !== undefined ? data.isActive : true,
    },
    include: {
      roomType: true,
    },
  });
};

export const findRatePlans = async (
  propertyId?: number, // ✅ Removed tenantId
  roomTypeId?: number,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  
  // ✅ Removed tenantId check
  if (propertyId) where.propertyId = propertyId;
  if (roomTypeId) where.roomTypeId = roomTypeId;
  where.isActive = true;

  const [ratePlans, total] = await Promise.all([
    prisma.ratePlan.findMany({
      where,
      skip,
      take: limit,
      orderBy: { planName: 'asc' },
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
            reservationRooms: true,
          },
        },
      },
    }),
    prisma.ratePlan.count({ where }),
  ]);

  return { ratePlans, total, page, limit };
};

export const findRatePlanById = async (ratePlanId: number) => {
  return prisma.ratePlan.findUnique({
    where: { ratePlanId },
    include: {
      roomType: true,
      property: {
        select: {
          propertyId: true,
          propertyName: true,
          propertyCode: true,
          // ✅ Removed tenantId: true
        },
      },
    },
  });
};

export const updateRatePlan = async (
  ratePlanId: number,
  data: Partial<{
    planName: string;
    description: string;
    isPublic: boolean;
    minStay: number;
    maxStay: number;
    discountPercent: number;
    isActive: boolean;
  }>
) => {
  return prisma.ratePlan.update({
    where: { ratePlanId },
    data,
  });
};

export const deleteRatePlan = async (ratePlanId: number) => {
  return prisma.ratePlan.update({
    where: { ratePlanId },
    data: { isActive: false },
  });
};