-- Moolre mobile money replaces Paystack. Additive only: the old Paystack column and history are kept.
ALTER TABLE "properties" ADD COLUMN "moolreUsername" VARCHAR(100),
ADD COLUMN "moolrePublicKey" TEXT,
ADD COLUMN "moolreAccountNumber" VARCHAR(50),
ADD COLUMN "moolreWebhookSecret" TEXT;

ALTER TABLE "guest_payment_attempts" ADD COLUMN "payer" VARCHAR(20),
ADD COLUMN "channel" VARCHAR(10);

ALTER TABLE "subscription_payments" ADD COLUMN "payer" VARCHAR(20),
ADD COLUMN "channel" VARCHAR(10),
ADD COLUMN "providerStep" VARCHAR(30);
