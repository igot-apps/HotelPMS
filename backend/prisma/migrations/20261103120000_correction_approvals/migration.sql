ALTER TABLE "users" ADD COLUMN "correctionPermissions" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "correction_requests" (
  "requestId" SERIAL PRIMARY KEY,
  "propertyId" INTEGER NOT NULL REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE,
  "reservationId" TEXT NOT NULL REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestedBy" INTEGER REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE,
  "reviewedBy" INTEGER REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" VARCHAR(40) NOT NULL,
  "input" JSONB NOT NULL,
  "expectedVersion" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "reviewReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3)
);
CREATE INDEX "correction_requests_propertyId_status_createdAt_idx" ON "correction_requests"("propertyId", "status", "createdAt");
CREATE INDEX "correction_requests_reservationId_status_idx" ON "correction_requests"("reservationId", "status");
