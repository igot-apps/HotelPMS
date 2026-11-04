CREATE TABLE "refunds" (
 "refundId" SERIAL PRIMARY KEY,
 "requestId" INTEGER NOT NULL UNIQUE REFERENCES "correction_requests"("requestId") ON DELETE CASCADE ON UPDATE CASCADE,
 "propertyId" INTEGER NOT NULL REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE,
 "reservationId" TEXT NOT NULL REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE,
 "paymentId" INTEGER NOT NULL REFERENCES "payments"("paymentId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "amount" DECIMAL(10,2) NOT NULL CHECK ("amount" > 0),
 "method" VARCHAR(30) NOT NULL,
 "reference" VARCHAR(200) NOT NULL,
 "returnedBy" INTEGER REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE,
 "returnedByName" VARCHAR(200) NOT NULL,
 "returnedAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "refunds_reservationId_idx" ON "refunds"("reservationId");
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");
CREATE INDEX "refunds_propertyId_returnedAt_idx" ON "refunds"("propertyId", "returnedAt");
