import { prisma } from '../../shared/utils/prisma';
import { getSubscriptionState, subscriptionFields } from './subscription-state';

const action = 'FreeSubscriptionAccessGranted';
const day = 86_400_000;

export function listFreeAccess(propertyId: number) {
  return prisma.auditLog.findMany({
    where: { entityType: 'Property', entityId: propertyId, action },
    orderBy: { auditLogId: 'desc' },
    select: { auditLogId: true, newData: true, createdAt: true, user: { select: { fullName: true } } },
  });
}

export async function grantFreeAccess(propertyId: number, userId: number, input: { days?: unknown; reason?: unknown; expectedVersion?: unknown }) {
  const days = Number(input.days);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Choose between 1 and 365 days.');
  if (!reason || reason.length > 300) throw new Error('Enter a reason of up to 300 characters.');

  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "propertyId" FROM "properties" WHERE "propertyId" = ${propertyId} FOR UPDATE`;
    const property = await tx.property.findUnique({
      where: { propertyId },
      select: { ...subscriptionFields, isActive: true, status: true, updatedAt: true },
    });
    if (!property?.isActive || property.status !== 'Active') throw new Error('Select an active hotel.');
    const now = new Date();
    const state = getSubscriptionState(property, now);
    const startsAt = !state.expired && state.endsAt && state.endsAt > now ? state.endsAt : now;
    const endsAt = new Date(startsAt.getTime() + days * day);
    const version = `${property.updatedAt.toISOString()}:${days}:${reason}`;
    const grant = { days, reason, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
    if (input.expectedVersion === undefined) return { ...grant, version };
    if (input.expectedVersion !== version) throw new Error('The hotel or grant details changed. Preview the grant again.');

    await tx.property.update({
      where: { propertyId },
      data: { subscriptionStatus: 'Active', subscriptionEndsAt: endsAt },
      select: { propertyId: true },
    });
    await tx.auditLog.create({ data: { propertyId: propertyId, userId, action, entityType: 'Property', entityId: propertyId, newData: grant } });
    return grant;
  });
}
