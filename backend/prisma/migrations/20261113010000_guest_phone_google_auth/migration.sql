ALTER TABLE "platform_guests" ADD COLUMN "googleSubject" VARCHAR(255);
CREATE UNIQUE INDEX "platform_guests_googleSubject_key" ON "platform_guests"("googleSubject");

CREATE TABLE "guest_phone_challenges" (
  "id" UUID NOT NULL,
  "phone" VARCHAR(50) NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "purpose" VARCHAR(20) NOT NULL,
  "googleSub" VARCHAR(255),
  "googleEmail" VARCHAR(200),
  "googleName" VARCHAR(200),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "guestId" INTEGER,
  CONSTRAINT "guest_phone_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "guest_phone_challenges_phone_createdAt_idx" ON "guest_phone_challenges"("phone", "createdAt");
ALTER TABLE "guest_phone_challenges" ADD CONSTRAINT "guest_phone_challenges_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "platform_guests"("guestId") ON DELETE SET NULL ON UPDATE CASCADE;
