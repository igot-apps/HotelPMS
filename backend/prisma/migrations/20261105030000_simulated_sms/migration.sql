ALTER TABLE "properties" ADD COLUMN "smsSimulationEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "simulated_sms" (
    "messageId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "reservationId" TEXT NOT NULL,
    "eventKey" VARCHAR(180) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "recipient" VARCHAR(20) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "simulated_sms_pkey" PRIMARY KEY ("messageId")
);

CREATE UNIQUE INDEX "simulated_sms_eventKey_key" ON "simulated_sms"("eventKey");
CREATE INDEX "simulated_sms_propertyId_createdAt_idx" ON "simulated_sms"("propertyId", "createdAt");
ALTER TABLE "simulated_sms" ADD CONSTRAINT "simulated_sms_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;
