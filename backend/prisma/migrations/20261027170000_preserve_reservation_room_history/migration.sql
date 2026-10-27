-- Preserve room identity on reservation records before inventory can be removed.
ALTER TABLE "reservation_rooms"
ADD COLUMN "roomNumberSnapshot" VARCHAR(20),
ADD COLUMN "roomTypeNameSnapshot" VARCHAR(100);

UPDATE "reservation_rooms" AS rr
SET "roomNumberSnapshot" = r."roomNumber",
    "roomTypeNameSnapshot" = rt."typeName"
FROM "rooms" AS r, "room_types" AS rt
WHERE rr."roomId" = r."roomId"
  AND rr."roomTypeId" = rt."roomTypeId";

ALTER TABLE "reservation_rooms"
DROP CONSTRAINT "reservation_rooms_roomId_fkey",
DROP CONSTRAINT "reservation_rooms_roomTypeId_fkey",
DROP CONSTRAINT "reservation_rooms_ratePlanId_fkey";

ALTER TABLE "reservation_rooms"
ALTER COLUMN "roomId" DROP NOT NULL,
ALTER COLUMN "roomTypeId" DROP NOT NULL;

ALTER TABLE "reservation_rooms"
ADD CONSTRAINT "reservation_rooms_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("roomId") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "reservation_rooms_roomTypeId_fkey"
  FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("roomTypeId") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "reservation_rooms_ratePlanId_fkey"
  FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("ratePlanId") ON DELETE SET NULL ON UPDATE CASCADE;
