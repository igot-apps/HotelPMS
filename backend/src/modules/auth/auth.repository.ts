import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const findUserByUsernameOrEmail = async (identifier: string) => {
  return prisma.user.findFirst({
    where: {
      OR: [
        { username: identifier }, // ✅ Checks if it matches the username
        { email: identifier },    // ✅ Checks if it matches the email
      ],
    },
    // ⚠️ IMPORTANT: Keep your existing `include` block exactly as it was!
    // It should look something like this to fetch roles and permissions:
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
      property: {
        select: {
          propertyId: true,
          propertyName: true,
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