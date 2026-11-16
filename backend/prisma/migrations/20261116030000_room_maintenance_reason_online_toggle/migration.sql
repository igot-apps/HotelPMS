-- Maintenance reason and per-room online booking switch
ALTER TABLE "rooms" ADD COLUMN "maintenanceReason" VARCHAR(200);
ALTER TABLE "rooms" ADD COLUMN "isOnlineBookable" BOOLEAN NOT NULL DEFAULT true;

-- Managers can let specific receptionists hide rooms from online booking
ALTER TABLE "users" ADD COLUMN "canManageOnlineRooms" BOOLEAN NOT NULL DEFAULT false;
