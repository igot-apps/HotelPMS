ALTER TABLE "reservation_rooms"
ADD COLUMN "guestPresenceStatus" VARCHAR(20) NOT NULL DEFAULT 'InRoom',
ADD COLUMN "guestOutAt" TIMESTAMP(3),
ADD COLUMN "expectedReturnAt" TIMESTAMP(3),
ADD COLUMN "guestReturnedAt" TIMESTAMP(3),
ADD COLUMN "presenceUpdatedBy" INTEGER;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_presenceUpdatedBy_fkey"
FOREIGN KEY ("presenceUpdatedBy") REFERENCES "users"("userId")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "reservation_rooms_guestPresenceStatus_idx"
ON "reservation_rooms"("guestPresenceStatus");
