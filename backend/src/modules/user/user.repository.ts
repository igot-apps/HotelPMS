import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const findUsers = async (
  propertyId?: number, // ✅ Removed tenantId
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};

  if (propertyId) where.propertyId = propertyId; // ✅ Removed tenantId

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        role: { select: { roleId: true, roleName: true } },
        property: { select: { propertyId: true, propertyName: true } },
        _count: { select: { reservations: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
};

export const findUserById = async (userId: number) => {
  return prisma.user.findUnique({
    where: { userId },
    include: {
      role: true,
      property: { select: { propertyId: true, propertyName: true } },
    },
  });
};

export const findUserByUsernameOrEmail = async (
  username: string,
  email: string | null,
  propertyId: number // ✅ Scoped to property instead of tenant
) => {
  return prisma.user.findFirst({
    where: {
      propertyId, // ✅ Removed tenantId
      OR: [
        { username: username },
        email ? { email: email } : {},
      ],
    },
  });
};

export const createUser = async (data: {
  propertyId: number; // ✅ Removed tenantId
  fullName: string;
  username: string;
  email: string | null;
  passwordHash: string;
  roleId: number;
  isActive?: boolean;
}) => {
  return prisma.user.create({
    data: {
      propertyId: data.propertyId, // ✅ Removed tenantId
      fullName: data.fullName,
      username: data.username,
      email: data.email,
      passwordHash: data.passwordHash,
      roleId: data.roleId,
      isActive: data.isActive !== undefined ? data.isActive : true,
    },
    include: {
      role: { select: { roleId: true, roleName: true } },
      property: { select: { propertyId: true, propertyName: true } },
    },
  });
};

export const updateUser = async (
  userId: number,
  data: Partial<{
    fullName: string;
    username: string;
    email: string | null;
    passwordHash: string;
    roleId: number;
    propertyId: number ;
    isActive: boolean;
  }>
) => {
  return prisma.user.update({
    where: { userId },
    data,
    include: {
      role: { select: { roleId: true, roleName: true } },
      property: { select: { propertyId: true, propertyName: true } },
    },
  });
};

export const deactivateUser = async (userId: number) => {
  return prisma.user.update({
    where: { userId },
    data: { isActive: false },
  });
};

export const findAllRoles = async () => {
  return prisma.role.findMany({
    orderBy: { roleName: 'asc' },
    include: {
      rolePermissions: { include: { permission: true } },
    },
  });
};