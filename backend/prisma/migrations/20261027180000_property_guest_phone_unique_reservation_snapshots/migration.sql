-- Canonicalize phone formats before enforcing per-property uniqueness.
WITH cleaned AS (
  SELECT
    "guestId",
    phone,
    regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') AS digits
  FROM "property_guests"
), normalized AS (
  SELECT
    "guestId",
    CASE
      WHEN BTRIM(COALESCE(phone, '')) = '' THEN NULL
      WHEN digits = '' THEN NULL
      WHEN digits ~ '^0[0-9]{9}$' THEN '+233' || SUBSTRING(digits FROM 2)
      WHEN digits ~ '^00233[0-9]{9}$' THEN '+' || SUBSTRING(digits FROM 3)
      WHEN digits ~ '^233[0-9]{9}$' THEN '+' || digits
      WHEN LEFT(BTRIM(phone), 1) = '+' THEN '+' || digits
      WHEN digits ~ '^00[0-9]+$' THEN '+' || SUBSTRING(digits FROM 3)
      ELSE digits
    END AS normalized_phone
  FROM cleaned
)
UPDATE "property_guests" AS guest
SET phone = normalized.normalized_phone
FROM normalized
WHERE guest."guestId" = normalized."guestId"
  AND guest.phone IS DISTINCT FROM normalized.normalized_phone;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "property_guests"
    WHERE phone IS NOT NULL
    GROUP BY "propertyId", phone
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate PropertyGuest phone numbers exist within a property. Resolve those guest records before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "property_guests_propertyId_phone_key"
  ON "property_guests"("propertyId", phone);

ALTER TABLE "reservations"
  ADD COLUMN "guestNameSnapshot" VARCHAR(200),
  ADD COLUMN "guestPhoneSnapshot" VARCHAR(50);

UPDATE "reservations" AS reservation
SET "guestNameSnapshot" = COALESCE(
      (SELECT property_guest."fullName"
       FROM "property_guests" AS property_guest
       WHERE property_guest."guestId" = reservation."propertyGuestId"),
      (SELECT platform_guest."fullName"
       FROM "platform_guests" AS platform_guest
       WHERE platform_guest."guestId" = reservation."platformGuestId")
    ),
    "guestPhoneSnapshot" = COALESCE(
      (SELECT property_guest.phone
       FROM "property_guests" AS property_guest
       WHERE property_guest."guestId" = reservation."propertyGuestId"),
      (SELECT platform_guest.phone
       FROM "platform_guests" AS platform_guest
       WHERE platform_guest."guestId" = reservation."platformGuestId")
    )
WHERE reservation."propertyGuestId" IS NOT NULL
   OR reservation."platformGuestId" IS NOT NULL;
