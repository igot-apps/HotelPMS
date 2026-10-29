ALTER TABLE "payments" ADD COLUMN "propertyId" INTEGER;

UPDATE "payments" AS payment
SET "propertyId" = reservation."propertyId"
FROM "reservations" AS reservation
WHERE payment."reservationId" = reservation."reservationId"
  AND payment."propertyId" IS NULL;

CREATE INDEX "payments_propertyId_idx" ON "payments"("propertyId");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId")
ON DELETE SET NULL ON UPDATE CASCADE;
