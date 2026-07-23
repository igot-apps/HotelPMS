/*
  Warnings:

  - The primary key for the `reservations` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "reservation_rooms" DROP CONSTRAINT "reservation_rooms_reservationId_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "reservationId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "reservation_rooms" ALTER COLUMN "reservationId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_pkey",
ALTER COLUMN "reservationId" DROP DEFAULT,
ALTER COLUMN "reservationId" SET DATA TYPE TEXT,
ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservationId");
DROP SEQUENCE "reservations_reservationId_seq";

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE;
