/*
  Warnings:

  - The `status` column on the `payments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `subscriptionStatus` column on the `properties` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `reservations` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `operationalStatus` column on the `rooms` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `housekeepingStatus` column on the `rooms` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('Trial', 'Active', 'Expired', 'Cancelled');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('Available', 'Occupied', 'Maintenance');

-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('Clean', 'Dirty', 'Inspected');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('Pending', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled', 'NoShow');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('Pending', 'Completed', 'Failed', 'Refunded');

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "status",
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'Completed';

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "subscriptionStatus",
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'Trial';

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "status",
ADD COLUMN     "status" "ReservationStatus" NOT NULL DEFAULT 'Pending';

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "operationalStatus",
ADD COLUMN     "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'Available',
DROP COLUMN "housekeepingStatus",
ADD COLUMN     "housekeepingStatus" "HousekeepingStatus" NOT NULL DEFAULT 'Clean';

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");
