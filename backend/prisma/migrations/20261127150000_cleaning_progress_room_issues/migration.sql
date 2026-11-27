-- Who is cleaning a room right now, and problems reported in rooms. Additive only.
ALTER TABLE "rooms" ADD COLUMN "cleaningStartedById" INTEGER;
ALTER TABLE "rooms" ADD COLUMN "cleaningStartedAt" TIMESTAMP(3);
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaningStartedById_fkey"
    FOREIGN KEY ("cleaningStartedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "room_issues" (
    "issueId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "roomUnsuitable" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Open',
    "reportedById" INTEGER,
    "resolvedById" INTEGER,
    "resolutionNote" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "room_issues_pkey" PRIMARY KEY ("issueId")
);

CREATE INDEX "room_issues_propertyId_status_idx" ON "room_issues"("propertyId", "status");
CREATE INDEX "room_issues_roomId_idx" ON "room_issues"("roomId");

ALTER TABLE "room_issues" ADD CONSTRAINT "room_issues_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "rooms"("roomId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_issues" ADD CONSTRAINT "room_issues_reportedById_fkey"
    FOREIGN KEY ("reportedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_issues" ADD CONSTRAINT "room_issues_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
