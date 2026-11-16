-- New guests sign in with hotel-scoped or central passwords; the legacy column is no longer required.
ALTER TABLE "platform_guests" ALTER COLUMN "passwordHash" DROP NOT NULL;
