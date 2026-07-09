import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const findUserByUsername = async (username: string) => {
  return prisma.user.findUnique({
    where: { username },
    include: {
      tenant: true,
      property: true, // 🚨 ADDED: Fetch the property relation
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
      property: true, // 🚨 ADDED: Fetch the property relation
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
      tenant: true,
      property: true, // 🚨 ADDED: Fetch the property relation
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