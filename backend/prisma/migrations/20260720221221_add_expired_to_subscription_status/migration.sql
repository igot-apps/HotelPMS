/*
  Warnings:

  - The values [PastDue] on the enum `SubscriptionStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionStatus_new" AS ENUM ('Trial', 'Active', 'Expired', 'Cancelled');
ALTER TABLE "public"."properties" ALTER COLUMN "subscriptionStatus" DROP DEFAULT;
ALTER TABLE "properties" ALTER COLUMN "subscriptionStatus" TYPE "SubscriptionStatus_new" USING ("subscriptionStatus"::text::"SubscriptionStatus_new");
ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
DROP TYPE "public"."SubscriptionStatus_old";
ALTER TABLE "properties" ALTER COLUMN "subscriptionStatus" SET DEFAULT 'Trial';
COMMIT;
