/*
  Warnings:

  - You are about to drop the column `guestId` on the `reservations` table. All the data in the column will be lost.
  - You are about to drop the `guests` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[confirmationCode]` on the table `reservations` will be added. If there are existing duplicate values, this will fail.
  - The required column `confirmationCode` was added to the `reservations` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "guests" DROP CONSTRAINT "guests_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_guestId_fkey";

-- DropIndex
DROP INDEX "reservations_guestId_idx";

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "galleryImages" JSONB,
ADD COLUMN     "houseRules" TEXT,
ADD COLUMN     "isOnlineBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "taxPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "guestId",
ADD COLUMN     "confirmationCode" TEXT NOT NULL,
ADD COLUMN     "platformGuestId" INTEGER,
ADD COLUMN     "propertyGuestId" INTEGER;

-- AlterTable
ALTER TABLE "room_types" ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "galleryImages" JSONB;

-- DropTable
DROP TABLE "guests";

-- CreateTable
CREATE TABLE "property_guests" (
    "guestId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50),
    "idNumber" VARCHAR(50),
    "address" TEXT,
    "city" VARCHAR(100),
    "country" VARCHAR(100),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_guests_pkey" PRIMARY KEY ("guestId")
);

-- CreateTable
CREATE TABLE "platform_guests" (
    "guestId" SERIAL NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_guests_pkey" PRIMARY KEY ("guestId")
);

-- CreateIndex
CREATE INDEX "property_guests_propertyId_idx" ON "property_guests"("propertyId");

-- CreateIndex
CREATE INDEX "property_guests_phone_idx" ON "property_guests"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "platform_guests_phone_key" ON "platform_guests"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "platform_guests_email_key" ON "platform_guests"("email");

-- CreateIndex
CREATE INDEX "platform_guests_phone_idx" ON "platform_guests"("phone");

-- CreateIndex
CREATE INDEX "platform_guests_email_idx" ON "platform_guests"("email");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_confirmationCode_key" ON "reservations"("confirmationCode");

-- CreateIndex
CREATE INDEX "reservations_propertyGuestId_idx" ON "reservations"("propertyGuestId");

-- CreateIndex
CREATE INDEX "reservations_platformGuestId_idx" ON "reservations"("platformGuestId");

-- AddForeignKey
ALTER TABLE "property_guests" ADD CONSTRAINT "property_guests_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_propertyGuestId_fkey" FOREIGN KEY ("propertyGuestId") REFERENCES "property_guests"("guestId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_platformGuestId_fkey" FOREIGN KEY ("platformGuestId") REFERENCES "platform_guests"("guestId") ON DELETE SET NULL ON UPDATE CASCADE;
