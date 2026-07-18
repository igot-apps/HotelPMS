import { Router, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';

const router = Router();
const prisma = new PrismaClient();

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
    // 🌟 1. Extract pagination params (default to page 1, limit 6)
    const { checkIn, checkOut, page = '1', limit = '6' } = req.query;
    
    const property = await checkOnlineBookingEnabled(propertyCode);
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // Fetch all active room types with images and amenities
    const roomTypes = await prisma.roomType.findMany({
      where: { 
        propertyId: property.propertyId, 
        isActive: true 
      },
      orderBy: { basePrice: 'asc' },
      include: {
        amenities: {
          include: { amenity: { select: { name: true, icon: true } } }
        },
        _count: {
          select: {
            rooms: {
              where: { operationalStatus: 'Available', housekeepingStatus: 'Clean' }
            }
          }
        }
      }
    });

    // 🌟 2. If dates are provided, filter out room types that are fully booked
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
                OR: [
                  { checkInDate: { lte: checkOutDate }, checkOutDate: { gte: checkInDate } }
                ]
              }
            }
          });

          const availableCount = totalRoomsOfType - bookedRooms;
          
          return {
            ...rt,
            availableRooms: availableCount,
            isAvailable: availableCount > 0
          };
        })
      );
      // Only keep room types that have > 0 availability
      availableRoomTypes = availabilityChecks.filter(rt => rt.isAvailable);
    }

    // 🌟 3. PAGINATION LOGIC (Applied AFTER availability filtering)
    const total = availableRoomTypes.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginatedData = availableRoomTypes.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // 🌟 4. Return the data AND the pagination metadata
    return res.json({ 
      success: true, 
      data: paginatedData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
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
    const { 
      checkInDate, checkOutDate, roomTypeId, 
      guestFullName, guestPhone, guestEmail, // For creating a new PlatformGuest
      platformGuestId, // Or link an existing verified guest
      agreedPricePerNight, notes 
    } = req.body;

    const property = await checkOnlineBookingEnabled(propertyCode);

    // 1. Validate Dates
    const cIn = new Date(checkInDate);
    const cOut = new Date(checkOutDate);
    if (cIn >= cOut) throw new Error('Check-out date must be after check-in date.');
    
    const nights = Math.ceil((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24));
    const baseTotal = Number(agreedPricePerNight) * nights;
    const taxAmount = baseTotal * (Number(property.taxPercentage) / 100);
    const finalTotal = baseTotal + taxAmount;

    // 2. Check Room Availability
    const totalRoomsOfType = await prisma.room.count({
      where: { propertyId: property.propertyId, roomTypeId, operationalStatus: 'Available' }
    });
    const bookedRooms = await prisma.reservationRoom.count({
      where: {
        roomTypeId,
        reservation: {
          propertyId: property.propertyId,
          status: { in: ['Confirmed', 'CheckedIn'] },
          OR: [{ checkInDate: { lte: cOut }, checkOutDate: { gte: cIn } }]
        }
      }
    });

    if (totalRoomsOfType - bookedRooms <= 0) {
      return res.status(400).json({ success: false, message: 'Sorry, this room type is no longer available for the selected dates.' });
    }

    // 3. Create or Link Platform Guest
    let finalPlatformGuestId = platformGuestId;
    if (!finalPlatformGuestId && guestFullName && guestPhone) {
      // Upsert guest by phone (simple V1 verification)
      const guest = await prisma.platformGuest.upsert({
        where: { phone: guestPhone },
        update: { fullName: guestFullName, email: guestEmail || undefined },
        create: { 
          fullName: guestFullName, 
          phone: guestPhone, 
          email: guestEmail || '', 
          passwordHash: 'PENDING_VERIFICATION', // Placeholder until OTP is built
          isPhoneVerified: false 
        }
      });
      finalPlatformGuestId = guest.guestId;
    }

    if (!finalPlatformGuestId) {
      throw new Error('Guest information is required for online bookings.');
    }

    // 4. Create Reservation (Prisma will auto-generate confirmationCode via @default(uuid()))
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
        amountPaid: 0, // Will be updated by Paystack webhook later
        balanceDue: finalTotal,
      },
      include: {
        platformGuest: { select: { fullName: true, phone: true, email: true } }
      }
    });

    // 5. Create Reservation Room
    await prisma.reservationRoom.create({
      data: {
        reservationId: reservation.reservationId,
        roomId: 0, // 🌟 V1: We assign a specific room at check-in. For now, we link the RoomType.
        roomTypeId: roomTypeId,
        checkInDate: cIn,
        checkOutDate: cOut,
        agreedPricePerNight: Number(agreedPricePerNight),
      }
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Reservation created successfully!',
      data: {
        confirmationCode: reservation.confirmationCode,
        totalAmount: finalTotal,
        guestName: reservation.platformGuest?.fullName
      }
    });

  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;