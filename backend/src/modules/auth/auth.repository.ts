import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const findUserByUsername = async (username: string) => {
  return prisma.user.findUnique({
    where: { username },
    include: {
      tenant: true,
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });
};

export const findUserById = async (userId: number) => {
  return prisma.user.findUnique({
    where: { userId },
    include: {
      tenant: true,
      role: true,
    },
  });
};

export const updateLastLogin = async (userId: number) => {
  return prisma.user.update({
    where: { userId },
    data: { lastLoginAt: new Date() },
  });
};

// ✅ Add this if needed for permission checking
export const findUserWithPermissions = async (userId: number) => {
  return prisma.user.findUnique({
    where: { userId },
    include: {
      tenant: true,
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });
};