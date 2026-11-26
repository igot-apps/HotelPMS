import { comparePassword ,hashPassword } from '../../shared/utils/password';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/jwt';
import * as authRepository from './auth.repository';
import { defaultHotelHostname } from '../property/website-domain.service';
import { getSubscriptionConfig } from '../payment/subscription-access';
import { getSubscriptionState } from '../payment/subscription-state';
import { canAccessProperty, listAccessibleProperties, isPropertyOwner } from '../../shared/utils/property-access';

import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

// Keep the registration-created Manager role aligned with the canonical seed.
// Render production databases may not have had the development seed script run.
const defaultManagerPermissions = [
  { code: 'CanManageStaffAndRoles', name: 'Manage Staff & Roles', category: 'Admin' },
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
    housekeepingEnabled?: boolean;
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
  
  // Platform admins must use /superadmin (its own rate limits). Answered before any password check,
  // so this endpoint never confirms a Super Admin password and never issues them tokens.
  if (user.isPlatformAdmin) {
    return { success: false, message: 'This is a Super Admin account. Super Admins cannot sign in as hotel staff — sign in at /superadmin.' };
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

  // Open the property the owner last worked in, if they still have access; otherwise home.
  const lastPropertyId = (user as any).lastPropertyId as number | null;
  const propertyId = lastPropertyId && lastPropertyId !== user.propertyId && await canAccessProperty(prisma, user.userId, lastPropertyId)
    ? lastPropertyId : user.propertyId || 0;
  return issueSession(user.userId, propertyId);
};

/** Tokens and the frontend session for one account working in one property. */
export async function issueSession(userId: number, propertyId: number): Promise<LoginResponse> {
  const user = await authRepository.findUserWithPermissions(userId);
  if (!user) return { success: false, message: 'User not found' };
  // 🚨 JWT PAYLOAD: propertyId is the active property (root scope). 0 for platform admins.
  const payload = {
    userId: user.userId,
    propertyId: propertyId || 0,
    roleId: user.roleId,
    username: user.username,
    sessionVersion: user.sessionVersion,
  };
  return {
    success: true,
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    user: await buildSessionUser(user, propertyId) as any,
  };
}

async function buildSessionUser(user: any, propertyId: number) {
  const permissions: string[] = (user.role.rolePermissions || []).map((rp: any) => rp.permission.code);
  if (user.role.roleName === 'Manager' && user.propertyId) {
    for (const permission of defaultManagerPermissions) {
      if (!permissions.includes(permission.code)) permissions.push(permission.code);
    }
  }
  const property: any = propertyId
    ? await prisma.property.findUnique({ where: { propertyId }, select: { propertyId: true, propertyName: true, housekeepingEnabled: true, subscriptionPlan: true, subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true } })
    : null;
  const properties = user.propertyId ? await listAccessibleProperties(prisma, user.userId) : [];
  const active = properties.find((p: any) => p.propertyId === propertyId);
  return {
    userId: user.userId,
    fullName: user.fullName,
    username: user.username,
    email: user.email || null,
    role: user.role.roleName,
    isPlatformAdmin: user.isPlatformAdmin,
    propertyId: property?.propertyId || null,
    propertyName: property?.propertyName || null,
    housekeepingEnabled: Boolean(property?.housekeepingEnabled),
    subscriptionPlan: property?.subscriptionPlan || 'Platform',
    subscriptionStatus: property?.subscriptionStatus || 'Active',
    trialEndsAt: property?.trialEndsAt || null,
    subscriptionEndsAt: property?.subscriptionEndsAt || null,
    isOwner: Boolean(active?.isOwner),
    canAddProperty: Boolean(user.propertyId) && !user.isPlatformAdmin && properties.some((p: any) => p.isOwner),
    properties: properties.map((p: any) => ({
      propertyId: p.propertyId, propertyName: p.propertyName, city: p.city, isOwner: p.isOwner,
      isActive: p.isActive && p.status === 'Active', expired: getSubscriptionState(p).expired,
    })),
    permissions,
  };
}

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
  if ((user.sessionVersion || null) !== (decoded.sessionVersion || null)) {
    return { success: false, message: 'Your password changed. Please sign in again.' };
  }

  // Keep the session in the property it was issued for, only while access remains.
  const propertyId = decoded.propertyId || 0;
  if (propertyId !== (user.propertyId || 0) && !await canAccessProperty(prisma, user.userId, propertyId)) {
    return { success: false, message: 'Your account access has changed. Please sign in again.' };
  }
  const payload = {
    userId: user.userId,
    propertyId,
    roleId: user.roleId,
    username: user.username,
    sessionVersion: user.sessionVersion,
  };

  const accessToken = generateAccessToken(payload);
  return { success: true, accessToken };
};

export const getUserById = async (userId: number, propertyId?: number) => {
  const user = await authRepository.findUserWithPermissions(userId);
  if (!user) return null;
  if (user.role.roleName === 'Manager' && user.propertyId) {
    await prisma.$transaction((tx: any) => ensureManagerPermissions(tx));
  }
  const session = await buildSessionUser(await authRepository.findUserWithPermissions(userId), propertyId ?? user.propertyId ?? 0);
  return { ...session, isActive: user.isActive, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt };
};

/** Move an owner's session to another property they manage. Fresh tokens, nothing carried over. */
export const switchProperty = async (userId: number, propertyId: number): Promise<LoginResponse> => {
  if (!Number.isInteger(propertyId) || propertyId <= 0) return { success: false, message: 'Choose a property.' };
  if (!await canAccessProperty(prisma, userId, propertyId)) {
    return { success: false, message: 'You do not have access to that property.' };
  }
  await prisma.user.update({ where: { userId }, data: { lastPropertyId: propertyId } });
  const session = await issueSession(userId, propertyId);
  await prisma.auditLog.create({ data: { propertyId: propertyId, userId, action: 'PropertySwitched', entityType: 'Property', entityId: propertyId, newData: { propertyId } } }).catch(() => {});
  return session;
};


type NewPropertyInput = {
  hotelName: string; slug: string; email: string; phone: string;
  area: string; city: string; region: string; latitude: number | null; longitude: number | null;
};

async function availableSlug(raw: string) {
  const slug = String(raw || '').trim().toLowerCase();
  if (slug !== String(raw || '').trim() || !defaultHotelHostname(slug)) throw new Error('Use a valid hotel URL with letters, numbers, and hyphens.');
  const slugExists = await prisma.property.findFirst({ where: { propertyCode: { equals: slug, mode: 'insensitive' } } });
  if (slugExists) throw new Error('This hotel URL is already taken. Please choose another.');
  if (await prisma.propertyWebsiteDomain.findUnique({ where: { hostname: `${slug}.hideout24.com` } })) throw new Error('This hotel URL is already reserved. Please choose another.');
  return slug;
}

function newPropertyData(data: NewPropertyInput, slug: string, trialEndsAt: Date, trial: { rooms: number; staff: number }) {
  return {
    propertyName: data.hotelName,
    propertyCode: slug,
    businessName: data.hotelName,
    propertyType: 'Hotel',
    primaryEmail: data.email,
    primaryPhone: data.phone,
    area: data.area,
    city: data.city,
    region: data.region,
    latitude: data.latitude,
    longitude: data.longitude,
    country: 'Ghana',
    currency: 'GHS',
    timezone: 'Africa/Accra',
    status: 'Active', // Operational status
    // Subscription & trial setup
    subscriptionPlan: 'Trial',
    subscriptionPackage: 'trial',
    subscriptionStatus: 'Trial' as const,
    trialEndsAt,
    roomAllowance: trial.rooms,
    staffAllowance: trial.staff,
  };
}

export const MAX_OWNED_PROPERTIES = 20;

/**
 * A registered owner adds another property to the same account. Each property
 * keeps its own subscription; additional properties get no free trial (the
 * trial is already ended) so they stay read-only until subscribed.
 */
export const addOwnedProperty = async (userId: number, data: NewPropertyInput) => {
  const owner = await prisma.user.findUnique({ where: { userId }, select: { isActive: true, isPlatformAdmin: true, propertyId: true } });
  if (!owner?.isActive || owner.isPlatformAdmin || !owner.propertyId || !await isPropertyOwner(prisma, userId)) {
    throw Object.assign(new Error('Only the registered property owner can add properties.'), { statusCode: 403 });
  }
  const owned = await prisma.propertyMembership.findMany({
    where: { userId, isOwner: true },
    select: { property: { select: { propertyId: true, propertyName: true, subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true, _count: { select: { subscriptionPayments: { where: { status: 'Completed' } } } } } } },
  });
  if (owned.length >= MAX_OWNED_PROPERTIES) throw new Error(`An account can manage at most ${MAX_OWNED_PROPERTIES} properties. Contact support for more.`);
  const unpaid = owned.find((m: any) => getSubscriptionState(m.property).expired && m.property._count.subscriptionPayments === 0);
  if (unpaid) throw new Error(`Subscribe ${unpaid.property.propertyName} before adding another property.`);
  for (const key of ['hotelName', 'area', 'city', 'region'] as const) {
    if (!String(data[key] || '').trim()) throw new Error('Property name, URL, area, city and region are required.');
  }
  const slug = await availableSlug(data.slug);
  const { trial } = await getSubscriptionConfig(prisma);
  const property = await prisma.$transaction(async (tx: any) => {
    const created = await tx.property.create({ data: newPropertyData({ ...data, hotelName: data.hotelName.trim() }, slug, new Date(), trial) });
    await tx.propertyMembership.create({ data: { userId, propertyId: created.propertyId, isOwner: true } });
    await tx.auditLog.create({ data: { propertyId: created.propertyId, userId, action: 'PropertyAdded', entityType: 'Property', entityId: created.propertyId, newData: { propertyId: created.propertyId, propertyName: created.propertyName, propertyCode: slug } } });
    return created;
  });
  return { propertyId: property.propertyId, propertyName: property.propertyName, propertyCode: property.propertyCode };
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
  latitude: number | null;
  longitude: number | null;
  ownerName: string;
  ownerEmail: string;
  password: string;
}) => {
  // 1. Check if the URL slug (propertyCode) is already taken
  const slug = await availableSlug(data.slug);

  // 2. Check if owner email is already in use
  const ownerExists = await prisma.user.findFirst({ where: { email: data.ownerEmail } });
  if (ownerExists) throw new Error('An account with this email already exists.');

  // Trial length and allowances come from the platform's subscription settings.
  const { trial } = await getSubscriptionConfig(prisma);

  // 3. Start a Prisma Transaction (All or Nothing)
  const result = await prisma.$transaction(async (tx: any) => {
    
    // A. Create the Property (The Hotel) with a free trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trial.days);

    const property = await tx.property.create({ data: newPropertyData(data, slug, trialEndsAt, trial) });

    // B. Ensure the default property-manager role and its permissions exist.
    // Do this on every registration: migrations create tables, but do not run
    // the development seed script on Render. Managers can onboard receptionists.
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

    // The registering account owns this property (excluded from staff limits).
    await tx.propertyMembership.create({ data: { userId: ownerUser.userId, propertyId: property.propertyId, isOwner: true } });

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
