import { prisma } from '../../shared/utils/prisma';
import { DEFAULT_CONFIG, SubscriptionConfig, SubscriptionError, validateConfig } from './subscription-plans';
import { getLimits, termsFields } from './subscription-state';

type Db = typeof prisma | any;

export async function getSubscriptionConfig(db: Db = prisma): Promise<SubscriptionConfig> {
  const row = await db.subscriptionSettings.findUnique({ where: { id: 1 } });
  if (!row?.config) return DEFAULT_CONFIG;
  try { return validateConfig(row.config); } catch { return DEFAULT_CONFIG; }
}

export async function saveSubscriptionConfig(input: unknown, userId: number) {
  const config = validateConfig(input);
  return prisma.$transaction(async tx => {
    const before = await tx.subscriptionSettings.findUnique({ where: { id: 1 } });
    await tx.subscriptionSettings.upsert({
      where: { id: 1 }, update: { config, updatedBy: userId }, create: { id: 1, config, updatedBy: userId },
    });
    await tx.auditLog.create({ data: {
      userId, action: 'SubscriptionSettingsChanged', entityType: 'SubscriptionSettings', entityId: 1,
      oldData: (before?.config as any) ?? undefined, newData: config as any,
    } });
    return config;
  });
}

// Rooms count unless their room type is archived or the room was deactivated.
export const countedRoomsWhere = (propertyId: number) => ({
  propertyId,
  roomType: { isActive: true },
  NOT: { operationalStatus: 'Maintenance' as const, maintenanceReason: 'Room deactivated' },
});

export async function getUsage(propertyId: number, db: Db = prisma) {
  const [rooms, staff] = await Promise.all([
    db.room.count({ where: countedRoomsWhere(propertyId) }),
    db.user.count({ where: { propertyId, OR: [{ isActive: true }, { invitationPending: true }] } }),
  ]);
  return { rooms, staff };
}

/**
 * Block adding rooms or staff past the hotel's allowance. Existing rooms and
 * staff keep working even when usage is already above the limit.
 */
export async function assertCapacity(propertyId: number, kind: 'rooms' | 'staff', adding = 1, db: Db = prisma) {
  if (!propertyId || adding <= 0) return;
  const [property, config, usage] = await Promise.all([
    db.property.findUnique({ where: { propertyId }, select: termsFields }),
    getSubscriptionConfig(db),
    getUsage(propertyId, db),
  ]);
  if (!property) return;
  const limits = getLimits(property, config);
  const limit = limits[kind];
  if (usage[kind] + adding > limit) {
    const label = kind === 'rooms' ? 'rooms' : 'staff accounts (including pending invitations)';
    throw new SubscriptionError(
      `Your ${limits.packageName} plan allows ${limit} ${label} and ${usage[kind]} are in use. Upgrade your plan on Billing & Plan to add more.`,
      409, 'PLAN_LIMIT_REACHED',
    );
  }
}
