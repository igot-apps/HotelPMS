CREATE TABLE "guest_payment_attempts" (
  "attemptId" SERIAL PRIMARY KEY,
  "reservationId" TEXT NOT NULL,
  "reference" VARCHAR(200) NOT NULL UNIQUE,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'Initializing',
  "checkoutUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guest_payment_attempts_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "guest_payment_attempts_reservationId_status_idx" ON "guest_payment_attempts"("reservationId", "status");
