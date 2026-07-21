/*
  Warnings:

  - The `status` column on the `payments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `subscriptionStatus` column on the `properties` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `reservations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `operationalStatus` column on the `rooms` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `housekeepingStatus` column on the `rooms` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "status",
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'Completed';

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "subscriptionStatus",
ADD COLUMN     "subscriptionStatus" VARCHAR(20) NOT NULL DEFAULT 'Trial';

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "status",
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'Pending';

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "operationalStatus",
ADD COLUMN     "operationalStatus" VARCHAR(20) NOT NULL DEFAULT 'Available',
DROP COLUMN "housekeepingStatus",
ADD COLUMN     "housekeepingStatus" VARCHAR(20) NOT NULL DEFAULT 'Clean';

-- DropEnum
DROP TYPE "HousekeepingStatus";

-- DropEnum
DROP TYPE "OperationalStatus";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "ReservationStatus";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");
