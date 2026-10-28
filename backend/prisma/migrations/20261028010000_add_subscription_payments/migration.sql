CREATE TABLE "subscription_payments" (
    "subscriptionPaymentId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "initiatedBy" INTEGER,
    "reference" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "durationMonths" INTEGER NOT NULL,
    "planName" VARCHAR(50) NOT NULL DEFAULT 'Pro',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("subscriptionPaymentId")
);

CREATE UNIQUE INDEX "subscription_payments_reference_key" ON "subscription_payments"("reference");
CREATE INDEX "subscription_payments_propertyId_status_idx" ON "subscription_payments"("propertyId", "status");
CREATE INDEX "subscription_payments_createdAt_idx" ON "subscription_payments"("createdAt");

ALTER TABLE "subscription_payments"
ADD CONSTRAINT "subscription_payments_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_payments"
ADD CONSTRAINT "subscription_payments_initiatedBy_fkey"
FOREIGN KEY ("initiatedBy") REFERENCES "users"("userId")
ON DELETE SET NULL ON UPDATE CASCADE;
