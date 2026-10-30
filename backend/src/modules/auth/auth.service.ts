import { comparePassword ,hashPassword } from '../../shared/utils/password';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/jwt';
import * as authRepository from './auth.repository';

import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

// Keep the registration-created Manager role aligned with the canonical seed.
// Render production databases may not have had the development seed script run.
const defaultManagerPermissions = [
  { code: 'CanCreateReservation', name: 'Create Reservation', category: 'Reservations' },
  { code: 'CanCancelReservation', name: 'Cancel Reservation', category: 'Reservations' },
  { code: 'CanCheckInGuest', name: 'Check In Guest', category: 'Reservations' },
  { code: 'CanCheckOutGuest', name: 'Check Out Guest', category: 'Reservations' },
  { code: 'CanViewRooms', name: 'View Rooms', category: 'Inventory' },
  { code: 'CanCreateRoom', name: 'Create Room', category: 'Inventory' },
  { code: 'CanUpdateRoom', name: 'Update Room', category: 'Inventory' },
  { code: 'CanDeleteRoom', name: 'Delete Room', category: 'Inventory' },
  { code: 'CanCreateRoomType', name: 'Create Room Type', category: 'Inventory' },
  { code: 'CanUpdateRoomType', name: 'Update Room Type', category: 'Inventory' },
  { code: 'CanDeleteRoomType', name: 'Delete Room Type', category: 'Inventory' },
  { code: 'CanUpdateRoomStatus', name: 'Update Room Status', category: 'Inventory' },
  { code: 'CanManageRates', name: 'Manage Rates', category: 'Inventory' },
  { code: 'CanProcessPayments', name: 'Process Payments', category: 'Billing' },
  { code: 'CanIssueRefunds', name: 'Issue Refunds', category: 'Billing' },
  { code: 'CanViewFinancialReports', name: 'View Financial Reports', category: 'Reports' },
  { code: 'CanManageBilling', name: 'Manage Billing', category: 'Billing' },
  { code: 'CanManageHousekeeping', name: 'Manage Housekeeping', category: 'Operations' },
  { code: 'CanManageMaintenance', name: 'Manage Maintenance', category: 'Operations' },
];

async function ensureManagerPermissions(tx: any) {
  for (const permission of defaultManagerPermissions) {
    await tx.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
  }

  const managerRole = await tx.role.upsert({
    where: { roleName: 'Manager' },
    update: {},
    create: { roleName: 'Manager', description: 'Property management access', isSystem: true },
  });
  const permissions = await tx.permission.findMany({
    where: { code: { in: defaultManagerPermissions.map(({ code }) => code) } },
  });

  await tx.rolePermission.createMany({
    data: permissions.map((permission: { permissionId: number }) => ({
      roleId: managerRole.roleId,
      permissionId: permission.permissionId,
    })),
    skipDuplicates: true,
  });

  return managerRole;
}

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
    isPlatformAdmin: boolean;
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
  if (!user.propertyId && !user.isPlatformAdmin) {
    return { success: false, message: 'This account is not assigned to a property.' };
  }
  
  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return { success: false, message: 'Invalid username or password' };
  }

  // Repair accounts registered before the production permission catalog was
  // initialized, so their next login restores the standard manager navigation.
  if (user.role.roleName === 'Manager' && user.propertyId) {
    await prisma.$transaction((tx: any) => ensureManagerPermissions(tx));
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
  if (user.role.roleName === 'Manager' && user.propertyId) {
    for (const permission of defaultManagerPermissions) {
      if (!permissions.includes(permission.code)) permissions.push(permission.code);
    }
  }

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
      isPlatformAdmin: user.isPlatformAdmin,
      propertyId: user.propertyId || null,
      propertyName: (user as any).property?.propertyName || null, // ✅ Safe navigation
      subscriptionPlan: user.property?.subscriptionPlan || 'Platform',
      subscriptionStatus: user.property?.subscriptionStatus || 'Active',
      trialEndsAt: user.property?.trialEndsAt || null,
      subscriptionEndsAt: user.property?.subscriptionEndsAt || null,
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
    isPlatformAdmin: user.isPlatformAdmin,
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
  area: string;
  city: string;
  region: string;
  ghanaPostAddress?: string;
  latitude?: number | null;
  longitude?: number | null;
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
        area: data.area,
        city: data.city,
        region: data.region,
        ghanaPostAddress: data.ghanaPostAddress || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
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

    // B. Ensure the default property-manager role and its permissions exist.
    // Do this on every registration: migrations create tables, but do not run
    // the development seed script on Render. The manager deliberately does
    // not receive CanManageStaffAndRoles (the seed uses the same policy).
    const managerRole = await ensureManagerPermissions(tx);

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
