/*
  Warnings:

  - You are about to alter the column `confirmationCode` on the `reservations` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.

*/
-- AlterTable
ALTER TABLE "reservations" ALTER COLUMN "confirmationCode" SET DATA TYPE VARCHAR(20);
