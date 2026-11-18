-- Hotel refund policy: non-refundable by default (managers can switch it off)
ALTER TABLE "properties" ADD COLUMN "isNonRefundable" BOOLEAN NOT NULL DEFAULT true;
