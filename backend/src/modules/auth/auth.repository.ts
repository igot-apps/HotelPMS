import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const findUserByUsername = async (username: string) => {
  return prisma.user.findUnique({
    where: { username },
    include: {
      property: true, // ✅ Property is now the root entity
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
      property: true, // ✅ Property is now the root entity
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

export const findUserWithPermissions = async (userId: number) => {
  return prisma.user.findUnique({
    where: { userId },
    include: {
      property: true, // ✅ Property is now the root entity
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