// backend/src/modules/user/user.repository.ts
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

export const findUsers = async (tenantId: number, propertyId?: number) => {
  const where: any = { tenantId };
  if (propertyId) where.propertyId = parseInt(String(propertyId));

  return prisma.user.findMany({
    where,
    include: { role: true, property: true },
    orderBy: { createdAt: 'desc' },
  });
};

export const findUserById = async (userId: number, tenantId: number) => {
  return prisma.user.findFirst({
    where: { userId, tenantId },
    include: { role: true, property: true },
  });
};

export const findUserByUsernameOrEmail = async (username: string, email: string | null, tenantId: number) => {
  return prisma.user.findFirst({
    where: {
      tenantId,
      OR: [
        { username },
        ...(email ? [{ email }] : []),
      ],
    },
  });
};

export const createUser = async (data: any) => {
  return prisma.user.create({ data });
};

export const updateUser = async (userId: number, data: any) => {
  return prisma.user.update({ where: { userId }, data });
};

export const deactivateUser = async (userId: number) => {
  return prisma.user.update({
    where: { userId },
    data: { isActive: false },
  });
};

export const findAllRoles = async () => {
  return prisma.role.findMany({ orderBy: { roleName: 'asc' } });
};