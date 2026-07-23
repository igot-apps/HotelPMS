-- AlterTable
ALTER TABLE "reservation_rooms" ADD COLUMN     "actualCheckIn" TIMESTAMP(3),
ADD COLUMN     "actualCheckOut" TIMESTAMP(3),
ADD COLUMN     "occupantName" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'Reserved';
