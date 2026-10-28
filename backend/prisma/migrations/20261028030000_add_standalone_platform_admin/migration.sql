ALTER TABLE "users"
  ALTER COLUMN "propertyId" DROP NOT NULL,
  ADD COLUMN "phone" VARCHAR(20);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
