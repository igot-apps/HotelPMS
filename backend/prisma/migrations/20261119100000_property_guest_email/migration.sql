-- Guests added by hotel staff can now have an email address
ALTER TABLE "property_guests" ADD COLUMN "email" VARCHAR(200);
