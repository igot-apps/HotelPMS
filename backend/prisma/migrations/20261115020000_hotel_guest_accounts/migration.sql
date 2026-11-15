ALTER TABLE "guest_email_challenges"
  ADD COLUMN "propertyId" INTEGER,
  ADD COLUMN "setupUsedAt" TIMESTAMP(3);

CREATE TABLE "hotel_guest_accounts" (
    "propertyId" INTEGER NOT NULL REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE,
    "email" VARCHAR(200) NOT NULL,
    "platformGuestId" INTEGER NOT NULL REFERENCES "platform_guests"("guestId") ON DELETE CASCADE ON UPDATE CASCADE,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "hotel_guest_accounts_pkey" PRIMARY KEY ("propertyId", "email")
);

CREATE INDEX "hotel_guest_accounts_platformGuestId_idx" ON "hotel_guest_accounts"("platformGuestId");
