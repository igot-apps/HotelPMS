import { comparePassword ,hashPassword } from '../../shared/utils/password';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/jwt';
import * as authRepository from './auth.repository';

import { PrismaClient } from '../../generated/prisma';
const prisma = new PrismaClient();

export interface LoginResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    userId: number;
    fullName: string;
    username: string;
    email: string | null;
    role: string;
    propertyId: number | null; 
    propertyName: string | null; 
    permissions: string[];
    // 🌟 NEW: Subscription & Trial fields added to the interface
    subscriptionPlan: string;
    subscriptionStatus: string;
    trialEndsAt: Date | null;
    subscriptionEndsAt: Date | null; 
  };
  message?: string;
}

export const loginUser = async (
  username: string,
  password: string
): Promise<LoginResponse> => {
  const user = await authRepository.findUserByUsernameOrEmail(username); 
  
  if (!user) {
    return { success: false, message: 'Invalid username or password' };
  }
  if (!user.isActive) {
    return { success: false, message: 'Account is deactivated' };
  }
  
  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return { success: false, message: 'Invalid username or password' };
  }

  await authRepository.updateLastLogin(user.userId);

  // 🚨 JWT PAYLOAD: propertyId is now the root scope. Fallback to 0 if null.
  const payload = {
    userId: user.userId,
    propertyId: user.propertyId || 0, 
    roleId: user.roleId,
    username: user.username,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const permissions = user.role.rolePermissions.map(
    (rp) => rp.permission.code
  );

  return {
    success: true,
    accessToken,
    refreshToken,
    user: {
      userId: user.userId,
      fullName: user.fullName,
      username: user.username,
      email: user.email || null,
      role: user.role.roleName,
      propertyId: user.propertyId || null,
      propertyName: (user as any).property?.propertyName || null, // ✅ Safe navigation
      subscriptionPlan: user.property.subscriptionPlan,
      subscriptionStatus: user.property.subscriptionStatus,
      trialEndsAt: user.property.trialEndsAt,
      subscriptionEndsAt: user.property.subscriptionEndsAt, // 
      permissions,
    },
  };
};

export const refreshAccessToken = async (refreshToken: string) => {
  const { verifyRefreshToken } = require('../../shared/utils/jwt');
  const decoded = verifyRefreshToken(refreshToken);
  
  if (!decoded) {
    return { success: false, message: 'Invalid refresh token' };
  }
  
  const user = await authRepository.findUserById(decoded.userId);
  if (!user || !user.isActive) {
    return { success: false, message: 'User not found or inactive' };
  }

  // 🚨 JWT PAYLOAD: Fallback to 0 if null
  const payload = {
    userId: user.userId,
    propertyId: user.propertyId || 0,
    roleId: user.roleId,
    username: user.username,
  };

  const accessToken = generateAccessToken(payload);
  return { success: true, accessToken };
};

export const getUserById = async (userId: number) => {
  const user = await authRepository.findUserById(userId);
  if (!user) return null;
  
  return {
    userId: user.userId,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role.roleName,
    propertyId: user.propertyId || null,
    propertyName: (user as any).property?.propertyName || null, // ✅ Safe navigation
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
};


// ==========================================
// 🌟 B2B SAAS: PUBLIC HOTEL REGISTRATION
// ==========================================
export const registerNewHotel = async (data: {
  hotelName: string;
  slug: string;
  email: string;
  phone: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
}) => {
  // 1. Check if the URL slug (propertyCode) is already taken
  const slugExists = await prisma.property.findUnique({ where: { propertyCode: data.slug } });
  if (slugExists) throw new Error('This hotel URL is already taken. Please choose another.');

  // 2. Check if owner email is already in use
  const ownerExists = await prisma.user.findFirst({ where: { email: data.ownerEmail } });
  if (ownerExists) throw new Error('An account with this email already exists.');

  // 3. Start a Prisma Transaction (All or Nothing)
  const result = await prisma.$transaction(async (tx: any) => {
    
    // A. Create the Property (The Hotel) with a 14-Day Free Trial
    // 🌟 Calculate the trial expiration date (14 days from right now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const property = await tx.property.create({
      data: {
        propertyName: data.hotelName,
        propertyCode: data.slug.toLowerCase().replace(/\s+/g, '-'), // URL friendly
        businessName: data.hotelName,
        propertyType: 'Hotel',
        primaryEmail: data.email,
        primaryPhone: data.phone,
        country: 'Ghana', 
        currency: 'GHS',
        timezone: 'Africa/Accra',
        status: 'Active', // Operational status
        
        // 🌟 NEW: Subscription & Trial Setup
        subscriptionPlan: 'Starter',
        subscriptionStatus: 'Trial', 
        trialEndsAt: trialEndsAt, // Automatically sets the 14-day expiration!
      },
    });

    // ✅ B. Find or Create the "Manager" Role (Changed from Hotel Owner)
    let managerRole = await tx.role.findFirst({ where: { roleName: 'Manager' } });
    if (!managerRole) {
      managerRole = await tx.role.create({ 
        data: { roleName: 'Manager', description: 'Default full-access role for the hotel manager', isSystem: true } 
      });
      
      // Assign all permissions to the Manager role automatically
      const allPermissions = await tx.permission.findMany();
      for (const perm of allPermissions) {
        await tx.rolePermission.create({
          data: { roleId: managerRole.roleId, permissionId: perm.permissionId },
        });
      }
    }

    // C. Create the Manager User Account
    const passwordHash = await hashPassword(data.password);
    
    // ✅ FIX: Generate a unique username by appending a random 4-digit number
    // e.g., "kofi" becomes "kofi_4829"
    const baseUsername = data.ownerEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    const uniqueUsername = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;

    const ownerUser = await tx.user.create({
      data: {
        propertyId: property.propertyId, // Tied directly to the new hotel!
        fullName: data.ownerName,
        username: uniqueUsername, // ✅ Use the guaranteed unique username
        email: data.ownerEmail,
        passwordHash,
        roleId: managerRole.roleId,
        isActive: true,
      },
    });

    return { property, ownerUser, managerRole }; // ✅ Return managerRole
  });

  // 4. Generate JWT and return to frontend (Auto-login)
  const payload = {
    userId: result.ownerUser.userId,
    propertyId: result.property.propertyId,
    roleId: result.managerRole.roleId, // ✅ Use managerRole
    username: result.ownerUser.username,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Fetch permissions for the frontend store
  const roleWithPerms = await prisma.role.findUnique({
    where: { roleId: result.managerRole.roleId }, // ✅ Use managerRole
    include: { rolePermissions: { include: { permission: true } } },
  });
  const permissions = roleWithPerms?.rolePermissions.map((rp: any) => rp.permission.code) || [];

  return {
  user: {
      userId: result.ownerUser.userId,
      fullName: result.ownerUser.fullName,
      username: result.ownerUser.username,
      email: result.ownerUser.email,
      role: result.managerRole.roleName, 
      propertyId: result.property.propertyId,
      propertyName: result.property.propertyName,
      // 🌟 NEW: Pass subscription data to frontend immediately upon registration
      subscriptionPlan: result.property.subscriptionPlan,
      subscriptionStatus: result.property.subscriptionStatus,
      trialEndsAt: result.property.trialEndsAt,
      permissions,
    },
    accessToken,
    refreshToken,
  };

};