-- Multi-property access: one row per (account, property).
ALTER TABLE "users" ADD COLUMN "lastPropertyId" INTEGER;

CREATE TABLE "property_memberships" (
    "membershipId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_memberships_pkey" PRIMARY KEY ("membershipId")
);

CREATE UNIQUE INDEX "property_memberships_userId_propertyId_key" ON "property_memberships"("userId", "propertyId");
CREATE INDEX "property_memberships_propertyId_idx" ON "property_memberships"("propertyId");

ALTER TABLE "property_memberships" ADD CONSTRAINT "property_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_memberships" ADD CONSTRAINT "property_memberships_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing property account gets a membership for its home property.
-- The registered owner is the earliest Manager account of each property.
WITH owners AS (
  SELECT DISTINCT ON (u."propertyId") u."userId"
  FROM "users" u
  JOIN "roles" r ON r."roleId" = u."roleId"
  WHERE u."propertyId" IS NOT NULL AND u."isPlatformAdmin" = false AND r."roleName" = 'Manager'
  ORDER BY u."propertyId", u."createdAt", u."userId"
)
INSERT INTO "property_memberships" ("userId", "propertyId", "isOwner", "isActive", "createdAt", "updatedAt")
SELECT u."userId", u."propertyId", (u."userId" IN (SELECT "userId" FROM owners)), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
WHERE u."propertyId" IS NOT NULL AND u."isPlatformAdmin" = false
ON CONFLICT ("userId", "propertyId") DO NOTHING;

-- Audit entries record the property they happened in (an owner may act in several).
ALTER TABLE "audit_logs" ADD COLUMN "propertyId" INTEGER;
CREATE INDEX "audit_logs_propertyId_createdAt_idx" ON "audit_logs"("propertyId", "createdAt");
UPDATE "audit_logs" a SET "propertyId" = u."propertyId" FROM "users" u WHERE a."userId" = u."userId" AND a."propertyId" IS NULL;
