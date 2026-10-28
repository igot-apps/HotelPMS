-- Keep the reservation-level departure date in sync with its latest room stay.
-- This repairs stays extended before the reservation summary was updated.
WITH latest_room_checkout AS (
  SELECT
    "reservationId",
    MAX("checkOutDate") AS latest_checkout
  FROM "reservation_rooms"
  GROUP BY "reservationId"
)
UPDATE "reservations" AS reservation
SET "checkOutDate" = room_dates.latest_checkout
FROM latest_room_checkout AS room_dates
WHERE reservation."reservationId" = room_dates."reservationId"
  AND reservation."checkOutDate" < room_dates.latest_checkout;
