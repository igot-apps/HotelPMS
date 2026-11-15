CREATE TABLE "guest_email_challenges" (
    "id" UUID NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guest_email_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_email_challenges_email_createdAt_idx"
ON "guest_email_challenges"("email", "createdAt");
