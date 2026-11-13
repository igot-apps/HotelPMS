ALTER TABLE "simulated_sms"
ADD COLUMN "provider" VARCHAR(20) NOT NULL DEFAULT 'simulation',
ADD COLUMN "providerReference" VARCHAR(180),
ADD COLUMN "sendStatus" VARCHAR(30) NOT NULL DEFAULT 'simulated',
ADD COLUMN "providerCode" VARCHAR(30),
ADD COLUMN "providerDeliveryStatus" VARCHAR(30),
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "statusCheckedAt" TIMESTAMP(3),
ADD COLUMN "failureReason" VARCHAR(100);

CREATE UNIQUE INDEX "simulated_sms_providerReference_key" ON "simulated_sms"("providerReference");

ALTER TABLE "guest_phone_challenges"
ADD COLUMN "smsProvider" VARCHAR(20) NOT NULL DEFAULT 'simulation',
ADD COLUMN "smsReference" VARCHAR(180),
ADD COLUMN "smsState" VARCHAR(30) NOT NULL DEFAULT 'simulated',
ADD COLUMN "smsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "smsStatusCheckedAt" TIMESTAMP(3),
ADD COLUMN "smsDeliveryStatus" VARCHAR(30);

CREATE UNIQUE INDEX "guest_phone_challenges_smsReference_key" ON "guest_phone_challenges"("smsReference");
