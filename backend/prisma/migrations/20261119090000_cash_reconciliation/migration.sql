-- Payments confirmed by the payment provider are marked explicitly (immutable records).
ALTER TABLE "payments" ADD COLUMN "verifiedProvider" VARCHAR(30);
ALTER TABLE "payments" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- One-time backfill for payments recorded by the Paystack verification flow before this column existed.
UPDATE "payments" SET "verifiedProvider" = 'Paystack', "verifiedAt" = "paymentDate"
WHERE "receivedBy" IS NULL AND "gatewayReference" IS NOT NULL AND "notes" = 'Online payment verified with Paystack.';

-- End-of-day cash counts (append-only history).
CREATE TABLE "cash_counts" (
    "cashCountId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "staffUserId" INTEGER NOT NULL,
    "expectedAmount" DECIMAL(10,2) NOT NULL,
    "countedAmount" DECIMAL(10,2) NOT NULL,
    "difference" DECIMAL(10,2) NOT NULL,
    "note" VARCHAR(300),
    "recordedBy" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("cashCountId")
);
CREATE INDEX "cash_counts_propertyId_businessDate_idx" ON "cash_counts"("propertyId", "businessDate");
CREATE INDEX "cash_counts_staffUserId_idx" ON "cash_counts"("staffUserId");
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_counts" ADD CONSTRAINT "cash_counts_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
