-- Idempotency: a money or booking save sent twice with the same key is only done once.
CREATE TABLE "idempotency_records" (
    "recordId" SERIAL NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "state" VARCHAR(20) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("recordId")
);

CREATE UNIQUE INDEX "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key");
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");
