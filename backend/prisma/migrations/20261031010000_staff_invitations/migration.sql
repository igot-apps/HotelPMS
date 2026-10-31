ALTER TABLE "users" ADD COLUMN "invitationTokenHash" TEXT,
ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
ADD COLUMN "invitationPending" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "users_invitationTokenHash_key" ON "users"("invitationTokenHash");
