-- Flexible subscription packages. Additive only: no rows or paid time are removed.

CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('Pending', 'Processing', 'Completed', 'Failed');
CREATE TYPE "SubscriptionChangeKind" AS ENUM ('New', 'Renewal', 'Upgrade', 'Downgrade');

-- Payment status: free text -> enum (unknown legacy values become Failed so they are never applied).
ALTER TABLE "subscription_payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "subscription_payments" ALTER COLUMN "status" TYPE "SubscriptionPaymentStatus"
  USING (CASE WHEN "status" IN ('Pending', 'Processing', 'Completed', 'Failed') THEN "status" ELSE 'Failed' END)::"SubscriptionPaymentStatus";
ALTER TABLE "subscription_payments" ALTER COLUMN "status" SET DEFAULT 'Pending';

ALTER TABLE "subscription_payments"
  ADD COLUMN "kind" "SubscriptionChangeKind" NOT NULL DEFAULT 'Renewal',
  ADD COLUMN "packageCode" VARCHAR(30),
  ADD COLUMN "roomAllowance" INTEGER,
  ADD COLUMN "staffAllowance" INTEGER,
  ADD COLUMN "monthlyPrice" DECIMAL(10,2),
  ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "prorationAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "pricing" JSONB;

-- Legacy orders were all on the single GHS 200/month plan.
UPDATE "subscription_payments" SET "packageCode" = 'legacy', "monthlyPrice" = 200 WHERE "packageCode" IS NULL;

ALTER TABLE "properties"
  ADD COLUMN "subscriptionPackage" VARCHAR(30),
  ADD COLUMN "roomAllowance" INTEGER,
  ADD COLUMN "staffAllowance" INTEGER,
  ADD COLUMN "subscriptionMonthlyPrice" DECIMAL(10,2),
  ADD COLUMN "subscriptionDiscountPercent" DECIMAL(5,2),
  ADD COLUMN "scheduledSubscription" JSONB,
  ADD COLUMN "subscriptionOverride" JSONB;

-- Existing hotels: paid hotels move to Standard at their old GHS 200 price; trials keep
-- trial terms. Allowances never drop below what the hotel already uses, so nothing breaks.
UPDATE "properties" p SET
  "subscriptionPackage" = CASE WHEN p."subscriptionStatus" = 'Trial' THEN 'trial' ELSE 'standard' END,
  "subscriptionPlan" = CASE WHEN p."subscriptionStatus" = 'Trial' THEN 'Trial' ELSE 'Standard' END,
  "subscriptionMonthlyPrice" = CASE WHEN p."subscriptionStatus" = 'Trial' THEN NULL ELSE 200 END,
  "subscriptionDiscountPercent" = 0,
  "roomAllowance" = GREATEST(20, (
    SELECT COUNT(*) FROM "rooms" r JOIN "room_types" t ON t."roomTypeId" = r."roomTypeId"
    WHERE r."propertyId" = p."propertyId" AND t."isActive" = true
      AND NOT (r."operationalStatus" = 'Maintenance' AND r."maintenanceReason" IS NOT DISTINCT FROM 'Room deactivated'))),
  "staffAllowance" = GREATEST(5, (
    SELECT COUNT(*) FROM "users" u
    WHERE u."propertyId" = p."propertyId" AND (u."isActive" = true OR u."invitationPending" = true)));

CREATE TABLE "subscription_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "updatedBy" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "subscription_settings" ("id", "config") VALUES (1, '{
  "packages": [
    {"code": "standard", "name": "Standard", "monthlyPrice": 200, "rooms": 20, "staff": 5, "active": true},
    {"code": "pro", "name": "Pro", "monthlyPrice": 350, "rooms": 40, "staff": 10, "active": true}
  ],
  "custom": {"enabled": true, "name": "Custom", "baseFee": 50, "perRoom": 5, "perStaff": 10, "minRooms": 1, "maxRooms": 200, "minStaff": 1, "maxStaff": 50},
  "minMonths": 1,
  "maxMonths": 24,
  "discounts": [
    {"minMonths": 1, "percent": 0}, {"minMonths": 3, "percent": 8.33}, {"minMonths": 6, "percent": 10},
    {"minMonths": 12, "percent": 16.67}, {"minMonths": 24, "percent": 20}
  ],
  "trial": {"days": 14, "rooms": 20, "staff": 5}
}'::jsonb) ON CONFLICT ("id") DO NOTHING;
