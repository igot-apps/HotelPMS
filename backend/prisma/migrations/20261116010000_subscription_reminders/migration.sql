ALTER TABLE "properties"
  ADD COLUMN "subscriptionReminderFor" TIMESTAMP(3),
  ADD COLUMN "subscriptionExpiryNoticeFor" TIMESTAMP(3);
