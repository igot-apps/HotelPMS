import { Router, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import axios from 'axios';

const router = Router();
const prisma = new PrismaClient();

// 🌟 HELPER: Haversine Formula to calculate distance in KM
const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in KM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// ============================================================
// 🌟 0. DISCOVER: Fetch all public properties with GPS sorting
// ⚠️ MUST BE FIRST - Before any /:propertyCode routes!
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

    // Format and calculate distance if user provided GPS
    let formatted = properties.map(p => {
      let distanceText = 'Distance unknown';
      let distanceKm = 99999; // Fallback for sorting

      // 🌟 CALCULATE DISTANCE if user GPS AND hotel GPS both exist
      if (userLat && userLng && p.latitude && p.longitude) {
        const km = getDistanceKm(
          parseFloat(userLat as string), 
          parseFloat(userLng as string), 
          p.latitude, 
          p.longitude
        );
        distanceKm = km;
        
        // Format nicely: show meters if < 1km, otherwise km
        if (km < 1) {
          distanceText = `${Math.round(km * 1000)} m away`;
        } else {
          distanceText = `${km.toFixed(1)} km away`;
        }
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
  if (!property) throw new Error('Property not found');
  if (!property.isOnlineBookingEnabled) throw new Error('Online booking is currently disabled for this property.');
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
        propertyId: true, propertyCode: true, propertyName: true, businessName: true,
        coverImage: true, galleryImages: true, publicDescription: true, cancellationPolicy: true,
        houseRules: true, taxPercentage: true, checkInTime: true, checkOutTime: true,
        address: true, city: true, country: true, primaryPhone: true, primaryEmail: true,
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
// 2. GET AVAILABLE ROOM TYPES
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
// 4. INITIALIZE GUEST PAYMENT
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
        metadata: { propertyCode, reservationId: String(reservationId) }
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
// 5. VERIFY GUEST PAYMENT
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
        headers: { Authorization: `Bearer ${property.paystackSecretKey}` }
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
            data: { amountPaid: { increment: amountPaid }, balanceDue: { decrement: amountPaid }, status: 'Confirmed' }
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
        }
      }
    }

    return res.json({ success: true, data: transactionData, status: transactionData.status });
  } catch (error: any) {
    console.error('Paystack Verify Error:', error.response?.data?.message || error.message);
    return res.status(500).json({ success: false, message: error.response?.data?.message || error.message });
  }
});

export default router;