// Multi-property access rules shared by auth and services.
// User.propertyId is the account's home property (always accessible while the
// account is active). Owners reach additional properties through active
// PropertyMembership rows. The active property is always the one in the token.

/** Prisma `where` fragment: the user can work in this property. */
export const atProperty = (propertyId: number) => ({
  OR: [
    { propertyId },
    { memberships: { some: { propertyId, isActive: true } } },
  ],
});

/** Prisma `where` fragment for counting staff seats: the property's owner never uses one. */
export const countsAsStaff = (propertyId: number) => ({
  propertyId,
  NOT: { memberships: { some: { propertyId, isOwner: true } } },
});

export async function canAccessProperty(db: any, userId: number, propertyId: number) {
  if (!propertyId) return false;
  const user = await db.user.findFirst({ where: { userId, isActive: true, ...atProperty(propertyId) }, select: { userId: true } });
  return Boolean(user);
}

/** Properties this account can switch between, home first. */
export async function listAccessibleProperties(db: any, userId: number) {
  const user = await db.user.findUnique({
    where: { userId },
    select: {
      propertyId: true,
      memberships: { where: { isActive: true }, select: { propertyId: true, isOwner: true } },
    },
  });
  if (!user?.propertyId) return [];
  const owner = new Map<number, boolean>(user.memberships.map((m: any) => [m.propertyId, m.isOwner]));
  const ids = [user.propertyId, ...user.memberships.map((m: any) => m.propertyId).filter((id: number) => id !== user.propertyId)];
  const properties = await db.property.findMany({
    where: { propertyId: { in: ids } },
    select: { propertyId: true, propertyName: true, propertyCode: true, city: true, isActive: true, status: true, subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true },
  });
  const byId = new Map<number, any>(properties.map((p: any) => [p.propertyId, p]));
  return ids.filter(id => byId.has(id)).map(id => ({ ...byId.get(id), isOwner: Boolean(owner.get(id)) }));
}

/** True when the account is the registered owner of at least one active property. */
export async function isPropertyOwner(db: any, userId: number) {
  const row = await db.propertyMembership.findFirst({ where: { userId, isOwner: true, isActive: true }, select: { membershipId: true } });
  return Boolean(row);
}

/** Prisma `where` fragment for audit entries that happened in this property (older rows fall back to the user's home). */
export const auditAt = (propertyId: number) => ({
  OR: [
    { propertyId },
    { propertyId: null, user: { propertyId } },
  ],
});
