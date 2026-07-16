-- CreateTable
CREATE TABLE "properties" (
    "propertyId" SERIAL NOT NULL,
    "propertyCode" VARCHAR(50) NOT NULL,
    "propertyName" VARCHAR(200) NOT NULL,
    "businessName" VARCHAR(200) NOT NULL,
    "legalName" VARCHAR(200),
    "subscriptionPlan" VARCHAR(50) NOT NULL DEFAULT 'Starter',
    "subscriptionStatus" VARCHAR(20) NOT NULL DEFAULT 'Trial',
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'Africa/Accra',
    "logo" TEXT,
    "primaryEmail" VARCHAR(200),
    "primaryPhone" VARCHAR(50),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "propertyType" VARCHAR(50) NOT NULL,
    "address" TEXT,
    "city" VARCHAR(100),
    "country" VARCHAR(100) NOT NULL,
    "gpsCoordinates" VARCHAR(100),
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "checkInTime" VARCHAR(10) NOT NULL DEFAULT '14:00',
    "checkOutTime" VARCHAR(10) NOT NULL DEFAULT '11:00',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("propertyId")
);

-- CreateTable
CREATE TABLE "users" (
    "userId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "username" TEXT NOT NULL,
    "email" VARCHAR(200),
    "passwordHash" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "roles" (
    "roleId" SERIAL NOT NULL,
    "roleName" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("roleId")
);

-- CreateTable
CREATE TABLE "permissions" (
    "permissionId" SERIAL NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("permissionId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "rolePermissionId" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("rolePermissionId")
);

-- CreateTable
CREATE TABLE "guests" (
    "guestId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(200),
    "idNumber" VARCHAR(50),
    "address" TEXT,
    "city" VARCHAR(100),
    "country" VARCHAR(100),
    "username" TEXT,
    "passwordHash" TEXT,
    "dateRegistered" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStayDate" TIMESTAMP(3),
    "totalStays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("guestId")
);

-- CreateTable
CREATE TABLE "room_types" (
    "roomTypeId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "typeName" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "maxOccupancy" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("roomTypeId")
);

-- CreateTable
CREATE TABLE "rooms" (
    "roomId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "roomNumber" VARCHAR(20) NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "floor" INTEGER,
    "operationalStatus" VARCHAR(20) NOT NULL DEFAULT 'Available',
    "housekeepingStatus" VARCHAR(20) NOT NULL DEFAULT 'Clean',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("roomId")
);

-- CreateTable
CREATE TABLE "rate_plans" (
    "ratePlanId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "planName" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "minStay" INTEGER NOT NULL DEFAULT 1,
    "maxStay" INTEGER DEFAULT 14,
    "discountPercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_plans_pkey" PRIMARY KEY ("ratePlanId")
);

-- CreateTable
CREATE TABLE "reservations" (
    "reservationId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "guestId" INTEGER NOT NULL,
    "staffId" INTEGER,
    "source" VARCHAR(50) NOT NULL DEFAULT 'Website',
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "totalAmount" DECIMAL(10,2),
    "amountPaid" DECIMAL(10,2),
    "balanceDue" DECIMAL(10,2),
    "refundDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundStatus" VARCHAR(20) NOT NULL DEFAULT 'None',
    "cancellationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("reservationId")
);

-- CreateTable
CREATE TABLE "reservation_rooms" (
    "reservationRoomId" SERIAL NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "ratePlanId" INTEGER,
    "checkInDate" TIMESTAMP(3) NOT NULL,
    "checkOutDate" TIMESTAMP(3) NOT NULL,
    "agreedPricePerNight" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_rooms_pkey" PRIMARY KEY ("reservationRoomId")
);

-- CreateTable
CREATE TABLE "payments" (
    "paymentId" SERIAL NOT NULL,
    "reservationId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" VARCHAR(50) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatewayReference" VARCHAR(200),
    "receivedBy" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Completed',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "auditLogId" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" INTEGER,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" VARCHAR(50),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("auditLogId")
);

-- CreateTable
CREATE TABLE "amenities" (
    "amenityId" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("amenityId")
);

-- CreateTable
CREATE TABLE "room_type_amenities" (
    "roomTypeId" INTEGER NOT NULL,
    "amenityId" INTEGER NOT NULL,

    CONSTRAINT "room_type_amenities_pkey" PRIMARY KEY ("roomTypeId","amenityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "properties_propertyCode_key" ON "properties"("propertyCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_roleName_key" ON "roles"("roleName");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "guests_username_key" ON "guests"("username");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_propertyId_typeName_key" ON "room_types"("propertyId", "typeName");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_propertyId_roomNumber_key" ON "rooms"("propertyId", "roomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rate_plans_propertyId_roomTypeId_planName_key" ON "rate_plans"("propertyId", "roomTypeId", "planName");

-- CreateIndex
CREATE INDEX "reservations_propertyId_idx" ON "reservations"("propertyId");

-- CreateIndex
CREATE INDEX "reservations_guestId_idx" ON "reservations"("guestId");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_checkInDate_checkOutDate_idx" ON "reservations"("checkInDate", "checkOutDate");

-- CreateIndex
CREATE INDEX "reservation_rooms_reservationId_idx" ON "reservation_rooms"("reservationId");

-- CreateIndex
CREATE INDEX "reservation_rooms_roomId_idx" ON "reservation_rooms"("roomId");

-- CreateIndex
CREATE INDEX "reservation_rooms_checkInDate_checkOutDate_idx" ON "reservation_rooms"("checkInDate", "checkOutDate");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_rooms_reservationId_roomId_key" ON "reservation_rooms"("reservationId", "roomId");

-- CreateIndex
CREATE INDEX "payments_reservationId_idx" ON "payments"("reservationId");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_propertyId_name_key" ON "amenities"("propertyId", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("roleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("roleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("permissionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("roomTypeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("roomTypeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("guestId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("roomId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("roomTypeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_rooms" ADD CONSTRAINT "reservation_rooms_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "rate_plans"("ratePlanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("reservationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("roomTypeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "amenities"("amenityId") ON DELETE CASCADE ON UPDATE CASCADE;
