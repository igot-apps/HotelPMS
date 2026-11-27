-- Per-person push alert choices (housekeepers). NULL means every alert is on.
ALTER TABLE "users" ADD COLUMN "notificationPreferences" JSONB;
