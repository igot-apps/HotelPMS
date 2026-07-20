I am working on a feature and introduced a bug. Here are the files I have modified/created since my last working commit. Please review them and help me find the issue:

### File: backend/prisma/schema.prisma
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// CORE - PROPERTY (Now the Root Entity / The Hotel)
// ============================================================
model Property {
  propertyId             Int       @id @default(autoincrement())
  propertyCode           String    @unique @db.VarChar(50)
  propertyName           String    @db.VarChar(200)
  businessName           String    @db.VarChar(200)
  legalName              String?   @db.VarChar(200)
  subscriptionPlan       String    @default("Starter") @db.VarChar(50)
  subscriptionStatus     String    @default("Trial") @db.VarChar(20)
  trialEndsAt            DateTime?
  subscriptionEndsAt     DateTime?
  currency               String    @default("GHS") @db.VarChar(10)
  timezone               String    @default("Africa/Accra") @db.VarChar(50)
  logo                   String?   @db.Text
  primaryEmail           String?   @db.VarChar(200)
  primaryPhone           String?   @db.VarChar(50)
  isActive               Boolean   @default(true)

  propertyType           String    @db.VarChar(50)
  address                String?   @db.Text
  city                   String?   @db.VarChar(100)
  country                String    @db.VarChar(100) 
  latitude          Float?
  longitude         Float?
  totalRooms             Int       @default(0)
  checkInTime            String    @default("14:00") @db.VarChar(10)
  checkOutTime           String    @default("11:00") @db.VarChar(10)
  status                 String    @default("Active") @db.VarChar(20)
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  // 🌟 NEW: Public Website Content & Settings
  coverImage             String?   @db.Text
  galleryImages          Json?     // Stores array of image URLs: ["url1", "url2"]
  publicDescription      String?   @db.Text
  cancellationPolicy     String?   @db.Text
  houseRules             String?   @db.Text
  taxPercentage          Decimal   @default(0.00) @db.Decimal(5, 2) // e.g., 15.00 for 15%
  isOnlineBookingEnabled Boolean   @default(false) // Master switch for public bookings
  // 🌟 NEW: Property-specific Paystack integration
  paystackSecretKey   String?   @db.Text // Encrypted Paystack secret key for this property

  // Reverse relations
  users                  User[]
  propertyGuests         PropertyGuest[]
  roomTypes              RoomType[]
  rooms                  Room[]
  ratePlans              RatePlan[]
  reservations           Reservation[]
  amenities              Amenity[]

  @@map("properties")
}

// ============================================================
// RBAC - USERS, ROLES, PERMISSIONS
// ============================================================
model User {
  userId            Int       @id @default(autoincrement())
  propertyId        Int
  fullName          String    @db.VarChar(200)
  username          String    @unique
  email             String?   @unique @db.VarChar(200)
  passwordHash      String    @db.Text
  roleId            Int
  isActive          Boolean   @default(true)
  lastLoginAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  property          Property  @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  role              Role      @relation(fields: [roleId], references: [roleId])
  reservations      Reservation[] @relation("staffReservations")
  payments          Payment[] @relation("receivedPayments")
  auditLogs         AuditLog[]

  @@map("users")
}

model Role {
  roleId            Int       @id @default(autoincrement())
  roleName          String    @unique @db.VarChar(50)
  description       String?   @db.Text
  isSystem          Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  users             User[]
  rolePermissions   RolePermission[]

  @@map("roles")
}

model Permission {
  permissionId      Int       @id @default(autoincrement())
  code              String    @unique @db.VarChar(100)
  name              String    @db.VarChar(100)
  description       String?   @db.Text
  category          String?   @db.VarChar(50)
  createdAt         DateTime  @default(now())

  rolePermissions   RolePermission[]

  @@map("permissions")
}

model RolePermission {
  rolePermissionId  Int       @id @default(autoincrement())
  roleId            Int
  permissionId      Int

  role              Role       @relation(fields: [roleId], references: [roleId], onDelete: Cascade)
  permission        Permission @relation(fields: [permissionId], references: [permissionId], onDelete: Cascade)

  @@unique([roleId, permissionId])
  @@map("role_permissions")
}

// ============================================================
// GUESTS - PROPERTY LEVEL (Internal Operational Records)
// ============================================================
model PropertyGuest {
  guestId        Int       @id @default(autoincrement())
  propertyId     Int       
  fullName       String    @db.VarChar(200)
  phone          String?   @db.VarChar(50) // No unique constraint; receptionists often enter shared/fake numbers
  idNumber       String?   @db.VarChar(50)
  address        String?   @db.Text
  city           String?   @db.VarChar(100)
  country        String?   @db.VarChar(100)
  notes          String?   @db.Text
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  property       Property  @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  reservations   Reservation[]

  @@index([propertyId])
  @@index([phone]) // Indexed for fast searching by reception, but NOT unique
  @@map("property_guests")
}

// ============================================================
// GUESTS - PLATFORM LEVEL (Verified Online Identities)
// ============================================================
model PlatformGuest {
  guestId           Int       @id @default(autoincrement())
  fullName          String    @db.VarChar(200)
  phone             String    @unique @db.VarChar(50) // Verified and unique globally
  email             String    @unique @db.VarChar(200) // Verified and unique globally
  passwordHash      String    @db.Text
  isPhoneVerified   Boolean   @default(false)
  isEmailVerified   Boolean   @default(false)
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  reservations      Reservation[]

  @@index([phone])
  @@index([email])
  @@map("platform_guests")
}

// ============================================================
// ROOM INVENTORY
// ============================================================
model RoomType {
  roomTypeId        Int       @id @default(autoincrement())
  propertyId        Int
  typeName          String    @db.VarChar(100)
  description       String?   @db.Text
  basePrice         Decimal   @db.Decimal(10, 2)
  maxOccupancy      Int       @default(1)
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // 🌟 NEW: Public Website Visuals
  coverImage        String?   @db.Text
  galleryImages     Json?     // Stores array of image URLs

  property          Property  @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  rooms             Room[]
  ratePlans         RatePlan[]
  reservationRooms  ReservationRoom[]
  amenities         RoomTypeAmenity[]

  @@unique([propertyId, typeName])
  @@map("room_types")
}

model Room {
  roomId            Int       @id @default(autoincrement())
  propertyId        Int
  roomNumber        String    @db.VarChar(20)
  roomTypeId        Int
  floor             Int?
  operationalStatus String    @default("Available") @db.VarChar(20)
  housekeepingStatus String   @default("Clean") @db.VarChar(20)
  notes             String?   @db.Text
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  property          Property  @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  roomType          RoomType  @relation(fields: [roomTypeId], references: [roomTypeId])
  reservationRooms  ReservationRoom[]

  @@unique([propertyId, roomNumber])
  @@map("rooms")
}

model RatePlan {
  ratePlanId        Int       @id @default(autoincrement())
  propertyId        Int
  roomTypeId        Int
  planName          String    @db.VarChar(100)
  description       String?   @db.Text
  isPublic          Boolean   @default(true)
  minStay           Int       @default(1)
  maxStay           Int?      @default(14)
  discountPercent   Decimal?  @db.Decimal(5, 2)
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  property          Property  @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  roomType          RoomType  @relation(fields: [roomTypeId], references: [roomTypeId])
  reservationRooms  ReservationRoom[]

  @@unique([propertyId, roomTypeId, planName])
  @@map("rate_plans")
}

// ============================================================
// RESERVATIONS
// ============================================================
model Reservation {
  reservationId     Int       @id @default(autoincrement())
  propertyId        Int
  
  // 🌟 NEW: Public Booking Confirmation & Dual Guest Support
  confirmationCode  String    @unique @default(uuid()) // Generates a unique string like "a1b2c3d4..."
  propertyGuestId   Int?      // Used for walk-ins / reception bookings
  platformGuestId   Int?      // Used for online verified bookings
  
  staffId           Int?
  source            String    @default("Website") @db.VarChar(50)
  checkInDate       DateTime
  checkOutDate      DateTime
  // 🌟 UPDATED: Added 'NoShow' to the supported statuses for future receptionist workflows
  status            String    @default("Pending") @db.VarChar(20) // Options: 'Pending', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled', 'NoShow'
  notes             String?   @db.Text
  totalAmount       Decimal?  @db.Decimal(10, 2)
  amountPaid        Decimal?  @db.Decimal(10, 2)
  balanceDue        Decimal?  @db.Decimal(10, 2)
  refundDue         Decimal   @default(0) @db.Decimal(10, 2)
  refundStatus      String    @default("None") @db.VarChar(20) // Options: 'None', 'Pending', 'Processed', 'Waived'
  cancellationDate  DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  property          Property       @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  propertyGuest     PropertyGuest? @relation(fields: [propertyGuestId], references: [guestId], onDelete: SetNull)
  platformGuest     PlatformGuest? @relation(fields: [platformGuestId], references: [guestId], onDelete: SetNull)
  staff             User?          @relation("staffReservations", fields: [staffId], references: [userId])
  reservationRooms  ReservationRoom[]
  payments          Payment[]

  @@index([propertyId])
  @@index([propertyGuestId])
  @@index([platformGuestId])
  @@index([status])
  @@index([checkInDate, checkOutDate])
  @@map("reservations")
}

model ReservationRoom {
  reservationRoomId   Int       @id @default(autoincrement())
  reservationId       Int
  roomId              Int
  roomTypeId          Int
  ratePlanId          Int?
  checkInDate         DateTime
  checkOutDate        DateTime
  agreedPricePerNight Decimal   @db.Decimal(10, 2)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  reservation         Reservation @relation(fields: [reservationId], references: [reservationId], onDelete: Cascade)
  room                Room      @relation(fields: [roomId], references: [roomId])
  roomType            RoomType  @relation(fields: [roomTypeId], references: [roomTypeId])
  ratePlan            RatePlan? @relation(fields: [ratePlanId], references: [ratePlanId])

  @@unique([reservationId, roomId])
  @@index([reservationId])
  @@index([roomId])
  @@index([checkInDate, checkOutDate])
  @@map("reservation_rooms")
}

// ============================================================
// PAYMENTS
// ============================================================
model Payment {
  paymentId         Int       @id @default(autoincrement())
  reservationId     Int
  amount            Decimal   @db.Decimal(10, 2)
  paymentMethod     String    @db.VarChar(50)
  paymentDate       DateTime  @default(now())
  gatewayReference  String?   @db.VarChar(200)
  receivedBy        Int?
  status            String    @default("Completed") @db.VarChar(20)
  notes             String?   @db.Text
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  reservation       Reservation @relation(fields: [reservationId], references: [reservationId], onDelete: Cascade)
  receiver          User?     @relation("receivedPayments", fields: [receivedBy], references: [userId])

  @@index([reservationId])
  @@index([paymentDate])
  @@map("payments")
}

// ============================================================
// AUDIT LOG
// ============================================================
model AuditLog {
  auditLogId        Int       @id @default(autoincrement())
  userId            Int?
  action            String    @db.VarChar(100)
  entityType        String    @db.VarChar(50)
  entityId          Int?
  oldData           Json?
  newData           Json?
  ipAddress         String?   @db.VarChar(50)
  userAgent         String?   @db.Text
  createdAt         DateTime  @default(now())

  user              User?     @relation(fields: [userId], references: [userId], onDelete: SetNull)

  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}

// ============================================================
// AMENITIES (Inline Tagging System)
// ============================================================
model Amenity {
  amenityId         Int       @id @default(autoincrement())
  propertyId        Int
  name              String    @db.VarChar(100)
  icon              String?   @db.VarChar(50) // e.g., "wifi", "ac", "tv", "pool"
  createdAt         DateTime  @default(now())

  property          Property  @relation(fields: [propertyId], references: [propertyId], onDelete: Cascade)
  roomTypes         RoomTypeAmenity[]

  @@unique([propertyId, name]) 
  @@map("amenities")
}

model RoomTypeAmenity {
  roomTypeId        Int
  amenityId         Int

  roomType          RoomType  @relation(fields: [roomTypeId], references: [roomTypeId], onDelete: Cascade)
  amenity           Amenity   @relation(fields: [amenityId], references: [amenityId], onDelete: Cascade)

  @@id([roomTypeId, amenityId])
  @@map("room_type_amenities")
}
```

### File: backend/src/modules/paystack
*Could not read file (might be binary or missing)*

### File: backend/src/modules/public/public.routes.ts
```ts
import { Router, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import axios from 'axios';

const router = Router();
const prisma = new PrismaClient();

// ============================================================
// 🌟 DISCOVER: Fetch all public properties with optional GPS sorting
// ============================================================
router.get('/discover', async (req: any, res: Response) => {
  try {
    const { search, userLat, userLng } = req.query;

    const where: any = { isOnlineBookingEnabled: true };

    // Search filter
    if (search && String(search).trim() !== '') {
      const searchTerm = String(search).trim();
      where.OR = [
        { propertyName: { contains: searchTerm, mode: 'insensitive' } },
        { city: { contains: searchTerm, mode: 'insensitive' } },
        { country: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const properties = await prisma.property.findMany({
      where,
      select: {
        propertyCode: true,
        propertyName: true,
        city: true,
        country: true,
        publicDescription: true,
        coverImage: true,
        latitude: true,   // 🌟 Fetch GPS
        longitude: true,  // 🌟 Fetch GPS
        roomTypes: {
          select: { basePrice: true },
          orderBy: { basePrice: 'asc' },
          take: 1 // Get the lowest price
        }
      }
    });

    // 🌟 Helper: Haversine Formula to calculate distance in KM
    const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // Radius of Earth in KM
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Format and calculate distance if user provided GPS
    let formatted = properties.map(p => {
      let distanceText = 'Distance unknown';
      let distanceKm = 99999; // Fallback for sorting

      if (userLat && userLng && p.latitude && p.longitude) {
        const km = getDistanceKm(
          parseFloat(userLat as string), 
          parseFloat(userLng as string), 
          p.latitude, 
          p.longitude
        );
        distanceKm = km;
        distanceText = km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
      }

      return {
        propertyCode: p.propertyCode,
        propertyName: p.propertyName,
        city: p.city,
        country: p.country,
        description: p.publicDescription,
        coverImage: p.coverImage,
        minPrice: p.roomTypes.length > 0 ? Number(p.roomTypes[0].basePrice) : 0,
        rating: 4.5, 
        distance: distanceText,
        distanceKm: distanceKm, // Used for sorting
        amenities: ['Free WiFi', 'Parking'] 
      };
    });

    // 🌟 SORT BY DISTANCE if user provided GPS coordinates
    if (userLat && userLng) {
      formatted.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('❌ Discover Endpoint Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Helper to check if property is online-booking enabled
const checkOnlineBookingEnabled = async (propertyCode: string) => {
  const property = await prisma.property.findUnique({
    where: { propertyCode },
    select: { propertyId: true, isOnlineBookingEnabled: true, taxPercentage: true }
  });
  if (!property) {
    throw new Error('Property not found');
  }
  if (!property.isOnlineBookingEnabled) {
    throw new Error('Online booking is currently disabled for this property.');
  }
  return property;
};

// ============================================================
// 1. GET PUBLIC PROPERTY DETAILS
// ============================================================
router.get('/:propertyCode', async (req: any, res: Response) => {
  try {
    const { propertyCode } = req.params;
    await checkOnlineBookingEnabled(propertyCode);
    const property = await prisma.property.findUnique({
      where: { propertyCode },
      select: {
        propertyId: true,
        propertyCode: true,
        propertyName: true,
        businessName: true,
        coverImage: true,
        galleryImages: true,
        publicDescription: true,
        cancellationPolicy: true,
        houseRules: true,
        taxPercentage: true,
        checkInTime: true,
        checkOutTime: true,
        address: true,
        city: true,
        country: true,
        primaryPhone: true,
        primaryEmail: true,
      }
    });
    return res.json({ success: true, data: property });
  } catch (error: any) {
    if (error.message.includes('disabled') || error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 2. GET AVAILABLE ROOM TYPES (with pagination & date filtering)
// ============================================================
router.get('/:propertyCode/room-types', async (req: any, res: Response) => {
  try {
    const { propertyCode } = req.params;
    const { checkIn, checkOut, page = '1', limit = '6' } = req.query;
    const property = await checkOnlineBookingEnabled(propertyCode);
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const roomTypes = await prisma.roomType.findMany({
      where: { propertyId: property.propertyId, isActive: true },
      orderBy: { basePrice: 'asc' },
      include: {
        amenities: { include: { amenity: { select: { name: true, icon: true } } } },
        _count: { select: { rooms: { where: { operationalStatus: 'Available', housekeepingStatus: 'Clean' } } } }
      }
    });
    let availableRoomTypes = roomTypes;
    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn as string);
      const checkOutDate = new Date(checkOut as string);
      const availabilityChecks = await Promise.all(
        roomTypes.map(async (rt) => {
          const totalRoomsOfType = await prisma.room.count({
            where: { propertyId: property.propertyId, roomTypeId: rt.roomTypeId, operationalStatus: 'Available' }
          });
          const bookedRooms = await prisma.reservationRoom.count({
            where: {
              roomTypeId: rt.roomTypeId,
              reservation: {
                propertyId: property.propertyId,
                status: { in: ['Confirmed', 'CheckedIn'] },
                OR: [{ checkInDate: { lte: checkOutDate }, checkOutDate: { gte: checkInDate } }]
              }
            }
          });
          const availableCount = totalRoomsOfType - bookedRooms;
          return { ...rt, availableRooms: availableCount, isAvailable: availableCount > 0 };
        })
      );
      availableRoomTypes = availabilityChecks.filter(rt => rt.isAvailable);
    }
    const total = availableRoomTypes.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedData = availableRoomTypes.slice((pageNum - 1) * limitNum, pageNum * limitNum);
    return res.json({
      success: true,
      data: paginatedData,
      pagination: { page: pageNum, limit: limitNum, total, totalPages }
    });
  } catch (error: any) {
    if (error.message.includes('disabled') || error.message.includes('not found')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 3. CREATE A PUBLIC WEB RESERVATION
// ============================================================
router.post('/:propertyCode/reservations', async (req: any, res: Response) => {
  try {
    const { propertyCode } = req.params;
    const { checkInDate, checkOutDate, roomTypeId, guestFullName, guestPhone, guestEmail, platformGuestId, agreedPricePerNight, notes } = req.body;
    const property = await checkOnlineBookingEnabled(propertyCode);
    const cIn = new Date(checkInDate);
    const cOut = new Date(checkOutDate);
    if (cIn >= cOut) throw new Error('Check-out date must be after check-in date.');
    const nights = Math.ceil((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24));
    const baseTotal = parseFloat(agreedPricePerNight) * nights;
    const taxAmount = baseTotal * (parseFloat(property.taxPercentage as any) / 100);
    const finalTotal = baseTotal + taxAmount;
    const availableRoom = await prisma.room.findFirst({
      where: {
        propertyId: property.propertyId,
        roomTypeId: roomTypeId,
        operationalStatus: 'Available',
        reservationRooms: {
          none: {
            reservation: {
              status: { in: ['Confirmed', 'CheckedIn'] },
              OR: [{ checkInDate: { lte: cOut }, checkOutDate: { gte: cIn } }]
            }
          }
        }
      }
    });
    if (!availableRoom) {
      return res.status(400).json({ success: false, message: 'Sorry, this room type is no longer available for the selected dates.' });
    }
    let finalPlatformGuestId = platformGuestId;
    if (!finalPlatformGuestId && guestFullName && guestPhone) {
      const guest = await prisma.platformGuest.upsert({
        where: { phone: guestPhone.trim() },
        update: { fullName: guestFullName.trim(), email: guestEmail?.trim() || undefined },
        create: {
          fullName: guestFullName.trim(),
          phone: guestPhone.trim(),
          email: guestEmail?.trim() || '',
          passwordHash: 'PENDING_VERIFICATION',
          isPhoneVerified: false
        }
      });
      finalPlatformGuestId = guest.guestId;
    }
    if (!finalPlatformGuestId) {
      throw new Error('Guest information is required for online bookings.');
    }
    const reservation = await prisma.reservation.create({
      data: {
        propertyId: property.propertyId,
        platformGuestId: finalPlatformGuestId,
        source: 'Website',
        checkInDate: cIn,
        checkOutDate: cOut,
        status: 'Confirmed',
        notes: notes || '',
        totalAmount: finalTotal,
        amountPaid: 0,
        balanceDue: finalTotal,
      },
      include: { platformGuest: { select: { fullName: true, phone: true, email: true } } }
    });
    await prisma.reservationRoom.create({
      data: {
        reservationId: reservation.reservationId,
        roomId: availableRoom.roomId,
        roomTypeId: roomTypeId,
        checkInDate: cIn,
        checkOutDate: cOut,
        agreedPricePerNight: parseFloat(agreedPricePerNight),
      }
    });
    return res.status(201).json({
      success: true,
      message: 'Reservation created successfully!',
      data: {
        reservationId: reservation.reservationId,
        confirmationCode: reservation.confirmationCode,
        totalAmount: finalTotal,
        guestName: reservation.platformGuest?.fullName
      }
    });
  } catch (error: any) {
    console.error('Reservation Creation Error:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// ============================================================
// 4. INITIALIZE GUEST PAYMENT (Mobile Money ONLY with Callback)
// ============================================================
router.post('/:propertyCode/payments/initialize', async (req: any, res: Response) => {
  try {
    const { propertyCode } = req.params;
    const { reservationId, email, amount } = req.body;
    const property = await prisma.property.findUnique({
      where: { propertyCode },
      select: { propertyId: true, paystackSecretKey: true, currency: true }
    });
    if (!property?.paystackSecretKey) {
      return res.status(400).json({ success: false, message: 'This hotel has not configured Mobile Money payments yet.' });
    }
    const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/public/${propertyCode}/booking-success`;
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(amount * 100),
        reference: `RES-${reservationId}-${Date.now()}`,
        currency: property.currency || 'GHS',
        channels: ['mobile_money'],
        callback_url: callbackUrl,
        metadata: {
          propertyCode,
          reservationId: String(reservationId)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${property.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return res.json({ success: true, data: response.data.data });
  } catch (error: any) {
    console.error('Paystack Initialization Error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Failed to initialize payment' });
  }
});

// ============================================================
// 🌟 5. VERIFY GUEST PAYMENT (For Local Development Fallback)
// ============================================================
router.get('/:propertyCode/payments/verify/:reference', async (req: any, res: Response) => {
  try {
    const { propertyCode, reference } = req.params;
    const property = await prisma.property.findUnique({
      where: { propertyCode },
      select: { propertyId: true, paystackSecretKey: true }
    });
    if (!property?.paystackSecretKey) {
      return res.status(400).json({ success: false, message: 'Property Paystack configuration not found' });
    }
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${property.paystackSecretKey}`,
        },
      }
    );
    const transactionData = response.data.data;
    if (transactionData.status === 'success') {
      const reservationId = parseInt(transactionData.metadata?.reservationId);
      const amountPaid = transactionData.amount / 100;
      if (reservationId) {
        const reservation = await prisma.reservation.findUnique({
          where: { reservationId },
          select: { amountPaid: true, status: true }
        });
        if (reservation && Number(reservation.amountPaid) === 0) {
          await prisma.reservation.update({
            where: { reservationId },
            data: {
              amountPaid: { increment: amountPaid },
              balanceDue: { decrement: amountPaid },
              status: 'Confirmed',
            }
          });
          await prisma.payment.create({
            data: {
              reservationId,
              amount: amountPaid,
              paymentMethod: 'Mobile Money',
              paymentDate: new Date(),
              gatewayReference: transactionData.reference,
              status: 'Completed',
              notes: `Online payment verified via frontend fallback`,
              receivedBy: null,
            }
          });
          console.log(`🔧 [VERIFY FALLBACK] Reservation #${reservationId} payment verified and recorded: GH₵ ${amountPaid}`);
        } else {
          console.log(`ℹ️ [VERIFY SKIPPED] Reservation #${reservationId} already processed by webhook`);
        }
      }
    }
    return res.json({
      success: true,
      data: transactionData,
      status: transactionData.status
    });
  } catch (error: any) {
    console.error('Paystack Verify Error:', error.response?.data?.message || error.message);
    return res.status(500).json({ success: false, message: error.response?.data?.message || error.message });
  }
});

export default router;
```

### File: backend/src/prisma-playground.ts
```ts
import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function checkGpsFields() {
  try {
    // Fetch just one property to inspect its structure
    const property = await prisma.property.findFirst();
    
    if (property) {
      console.log('\n--- PROPERTY GPS CHECK ---');
      console.log('Has latitude field:', 'latitude' in property);
      console.log('Has longitude field:', 'longitude' in property);
      console.log('Current Property Data:', property);
      console.log('--------------------------\n');
    } else {
      console.log('No properties found in the database.');
    }
  } catch (error) {
    console.error('Error checking fields:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGpsFields();
```

### File: frontend/src/pages/DiscoverPage.jsx
```jsx
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { 
  Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane, 
  Dumbbell, Mountain, Loader2, Building2, Search, Calendar, 
  X, Navigation, Crosshair
} from 'lucide-react';
import toast from 'react-hot-toast';

// Helper to map amenity strings to icons
const AmenityIcon = ({ name }) => {
  const lower = name?.toLowerCase() || '';
  if (lower.includes('wifi')) return <Wifi size={14} />;
  if (lower.includes('breakfast')) return <Coffee size={14} />;
  if (lower.includes('parking')) return <Car size={14} />;
  if (lower.includes('restaurant')) return <Utensils size={14} />;
  if (lower.includes('pool')) return <Waves size={14} />;
  if (lower.includes('shuttle') || lower.includes('airport')) return <Plane size={14} />;
  if (lower.includes('gym')) return <Dumbbell size={14} />;
  if (lower.includes('mountain') || lower.includes('view')) return <Mountain size={14} />;
  return <Star size={14} />;
};

export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // GPS Location State
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  
  // Read filters from URL
  const [destination, setDestination] = useState(searchParams.get('search') || '');
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '');
  const [isSearching, setIsSearching] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // 🌟 Request GPS from Browser
  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setIsLocating(false);
        toast.success('Location found! Sorting by distance...');
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Location permission denied. Please enable it in your browser settings.');
        } else {
          toast.error('Unable to retrieve your location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Fetch hotels with filters and GPS
  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicDiscover', destination, checkIn, checkOut, userLocation],
    queryFn: async () => {
      const params = {};
      if (destination) params.search = destination;
      if (checkIn) params.checkIn = checkIn;
      if (checkOut) params.checkOut = checkOut;
      if (userLocation) {
        params.userLat = userLocation.lat;
        params.userLng = userLocation.lng;
      }
      const res = await api.get('/public/discover', { params });
      return res.data.data || [];
    },
  });

  const hotels = data || [];
  const hasActiveFilters = destination || checkIn || checkOut;

  // Handle search submission
  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('search', destination);
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    setSearchParams(params, { replace: true });
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 500);
  };

  const clearFilters = () => {
    setDestination('');
    setCheckIn('');
    setCheckOut('');
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 🌟 HERO SECTION WITH SEARCH */}
      <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700 overflow-hidden">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/2 translate-y-1/2 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs font-semibold mb-6">
            <Building2 size={14} />
            STAYFOLIO · INDEPENDENT HOTELS, ONE PLATFORM
          </div>
          
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">
            Find your next stay,<br />
            <span className="bg-gradient-to-r from-warning-300 to-warning-500 bg-clip-text text-transparent">
              anywhere in Ghana.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-10">
            From Osu to the Northern Region — search real, independently‑run hotels and book direct confirmation in minutes.
          </p>

          {/* 🌟 SEARCH FORM */}
          <form onSubmit={handleSearch} className="max-w-5xl mx-auto">
            <div className="bg-surface rounded-2xl shadow-2xl p-3 md:p-4 border border-border">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3">
                {/* Destination */}
                <div className="md:col-span-5 relative">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1">Destination</label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="City, area, or hotel name"
                      className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                    />
                    {/* 🌟 GPS TARGET BUTTON */}
                    <button
                      type="button"
                      onClick={requestLocation}
                      disabled={isLocating || !!userLocation}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-primary-600 hover:bg-primary-50 rounded-md transition disabled:opacity-50"
                      title="Use my current location"
                    >
                      {isLocating ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : userLocation ? (
                        <Crosshair size={18} />
                      ) : (
                        <Navigation size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Check-in */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1">Check-in</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      type="date"
                      value={checkIn}
                      min={today}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                    />
                  </div>
                </div>

                {/* Check-out */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1">Check-out</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      type="date"
                      value={checkOut}
                      min={checkIn || tomorrow}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                    />
                  </div>
                </div>

                {/* Search Button */}
                <div className="md:col-span-2 flex items-end">
                  <button
                    type="submit"
                    className="w-full h-[42px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30"
                  >
                    {isSearching ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <Search size={18} />
                        <span className="hidden sm:inline">Search</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 🌟 RESULTS SECTION */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-text flex items-center gap-2">
              <MapPin className="text-primary-600" />
              {userLocation ? 'Hotels Nearest to You' : 'Hotels Near You'}
            </h2>
            {!isLoading && (
              <p className="text-sm text-text-muted mt-1">
                {hotels.length} {hotels.length === 1 ? 'property' : 'properties'} found
                {destination && <> in "<span className="font-semibold text-text">{destination}</span>"</>}
              </p>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:bg-secondary-50 transition"
            >
              <X size={16} /> Clear Filters
            </button>
          )}
        </div>

        {/* Active Filter Pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-6">
            {destination && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full border border-primary-100">
                <MapPin size={12} /> {destination}
                <button onClick={() => setDestination('')} className="ml-1 hover:text-primary-900">
                  <X size={12} />
                </button>
              </span>
            )}
            {checkIn && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-full border border-secondary-100">
                <Calendar size={12} /> {new Date(checkIn).toLocaleDateString()}
                <button onClick={() => setCheckIn('')} className="ml-1 hover:text-secondary-900">
                  <X size={12} />
                </button>
              </span>
            )}
            {checkOut && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-full border border-secondary-100">
                <Calendar size={12} /> {new Date(checkOut).toLocaleDateString()}
                <button onClick={() => setCheckOut('')} className="ml-1 hover:text-secondary-900">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-primary-500" size={40} />
            <p className="text-text-muted font-semibold">Searching hotels...</p>
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Building2 size={48} className="mx-auto text-danger-500 mb-4" />
            <h3 className="text-xl font-bold text-text mb-2">Failed to load hotels</h3>
            <p className="text-text-muted">Please check your connection and try again.</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && hotels.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Search size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-text mb-2">No hotels match your search</h3>
            <p className="text-text-muted mb-6">
              {hasActiveFilters 
                ? 'Try adjusting your filters or search a different destination.' 
                : 'Check back later for new properties.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition"
              >
                <X size={16} /> Clear All Filters
              </button>
            )}
          </div>
        )}

        {/* Hotel Grid */}
        {!isLoading && !isError && hotels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {hotels.map((hotel, index) => (
              <Link 
                key={hotel.propertyCode || index} 
                to={`/public/${hotel.propertyCode}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`}
                className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col"
              >
                {/* Image */}
                <div className="relative h-56 overflow-hidden bg-secondary-100">
                  <img 
                    src={hotel.coverImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'} 
                    alt={hotel.propertyName || 'Hotel Property'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                  {hotel.rating && (
                    <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm border border-border">
                      <Star size={14} className="text-warning-500 fill-warning-500" />
                      <span className="text-sm font-bold text-text">{hotel.rating}</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="mb-3">
                    <h3 className="text-lg font-bold text-text group-hover:text-primary-600 transition-colors">
                      {hotel.propertyName || 'Unnamed Property'}
                    </h3>
                    {hotel.city && (
                      <p className="text-sm text-text-muted flex items-center gap-1 mt-1">
                        <MapPin size={14} /> {hotel.city}{hotel.country ? `, ${hotel.country}` : ''}
                      </p>
                    )}
                  </div>

                  {hotel.description && (
                    <p className="text-sm text-text-muted mb-4 line-clamp-2 flex-1">
                      {hotel.description}
                    </p>
                  )}

                  {/* Amenities */}
                  {hotel.amenities && hotel.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-md border border-secondary-100">
                          <AmenityIcon name={amenity} /> {amenity}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: Price & Distance */}
                  <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                    <div>
                      <p className="text-xs text-text-muted">Starting from</p>
                      <p className="text-xl font-black text-primary-600">
                        GHS {hotel.minPrice || '0'} <span className="text-sm font-normal text-text-muted">/ night</span>
                      </p>
                    </div>
                    {hotel.distance && (
                      <span className="text-xs font-semibold text-text-muted bg-background px-2.5 py-1 rounded-lg border border-border">
                        {hotel.distance}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### File: backend/prisma/migrations/20260720163350_replace_gps_with_lat_lng/migration.sql
```sql
/*
  Warnings:

  - You are about to drop the column `gpsCoordinates` on the `properties` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "properties" DROP COLUMN "gpsCoordinates",
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

```

