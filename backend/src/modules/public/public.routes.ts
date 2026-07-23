import { Router, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import axios from 'axios';
import jwt from 'jsonwebtoken'; // Ensure this is imported at the top of the file


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
// 🌟 0. DISCOVER: Fetch all public properties with GPS sorting & TRUE Availability
// ⚠️ MUST BE FIRST - Before any /:propertyCode routes!
// ============================================================
router.get('/discover', async (req: any, res: Response) => {
  try {
    // 🌟 1. Extract pagination and date params
    const { search, userLat, userLng, checkIn, checkOut, page = '1', limit = '9' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // 🌟 2. Build the dynamic WHERE clause
    const where: any = { 
      isOnlineBookingEnabled: true,
      rooms: {
        some: {
          operationalStatus: 'Available', // Room must not be in maintenance
          // 🌟 IF dates are provided, ensure the room has NO overlapping reservations
          ...(checkIn && checkOut ? {
            reservationRooms: {
              none: {
                reservation: {
                  status: { in: ['Confirmed', 'CheckedIn'] }, // Ignore Cancelled/Pending
                  OR: [
                    { 
                      checkInDate: { lte: new Date(checkOut as string) }, 
                      checkOutDate: { gte: new Date(checkIn as string) } 
                    }
                  ]
                }
              }
            }
          } : {})
        }
      }
    };

    // Search filter (Name, City, Country)
    if (search && String(search).trim() !== '') {
      const searchTerm = String(search).trim();
      where.OR = [
        { propertyName: { contains: searchTerm, mode: 'insensitive' } },
        { city: { contains: searchTerm, mode: 'insensitive' } },
        { country: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // 🌟 3. Get total count for pagination (respects the availability filter)
    const total = await prisma.property.count({ where });

    // 🌟 4. Get paginated properties
    const properties = await prisma.property.findMany({
      where,
      skip,
      take: limitNum,
      select: {
        propertyCode: true,
        propertyName: true,
        city: true,
        country: true,
        publicDescription: true,
        coverImage: true,
        latitude: true,
        longitude: true,
        roomTypes: {
          select: { basePrice: true },
          orderBy: { basePrice: 'asc' },
          take: 1
        },
        amenities: {
          select: { name: true }
        }
      }
    });

    // Format and calculate distance
    let formatted = properties.map(p => {
      let distanceText = 'Distance unknown';
      let distanceKm = 99999;

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
        distanceKm: distanceKm,
        amenities: p.amenities.map((a: any) => a.name)
      };
    });

    // Sort by distance if GPS provided
    if (userLat && userLng) {
      formatted.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    // 🌟 5. Return paginated response
    return res.json({ 
      success: true, 
      data: { 
        hotels: formatted, 
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      } 
    });
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
// 🌟 6. GET GUEST RESERVATIONS (Paginated)
// ⚠️ MUST BE PLACED BEFORE ANY /:propertyCode ROUTES!
// ============================================================
router.get('/reservations', async (req: any, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    
    if (decoded.type !== 'platform_guest') {
      return res.status(403).json({ success: false, message: 'Access denied: Invalid user type' });
    }

    // 🌟 1. Extract pagination params
    const { page = '1', limit = '5' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(20, Math.max(1, parseInt(limit as string, 10))); // Cap at 20
    const skip = (pageNum - 1) * limitNum;

    const whereClause = { 
      platformGuestId: decoded.guestId,
      source: 'Website'
    };

    // 🌟 2. Get total count for pagination calculations
    const total = await prisma.reservation.count({ where: whereClause });

    // 🌟 3. Get paginated reservations
    const reservations = await prisma.reservation.findMany({
      where: whereClause,
      include: {
        property: { select: { propertyName: true, city: true, propertyCode: true } },
        reservationRooms: { include: { roomType: { select: { typeName: true } } } }
      },
      orderBy: { checkInDate: 'desc' },
      skip,
      take: limitNum
    });

    // 🌟 4. Return data with pagination metadata
    return res.json({ 
      success: true, 
      data: reservations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('❌ Fetch Reservations Error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});


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
   include: { 
     platformGuest: { select: { fullName: true, phone: true, email: true } } 
   }
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
   // ✅ FIX: Treat reservationId as a String (UUID), do NOT use parseInt
   const reservationId = String(transactionData.metadata?.reservationId); 
   const amountPaid = transactionData.amount / 100;
   
   if (reservationId && reservationId !== 'undefined') {
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

// ============================================================
// 🌟 6. PUBLIC GUEST REGISTRATION
// ============================================================
router.post('/auth/register', async (req: any, res: Response) => {
  try {
    const { fullName, phone, email, password } = req.body;

    if (!fullName || !phone || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Full name, phone, and password are required' 
      });
    }

    // Check if phone already exists
    const existingGuest = await prisma.platformGuest.findUnique({
      where: { phone: phone.trim() }
    });

    if (existingGuest) {
      return res.status(400).json({ 
        success: false, 
        message: 'An account with this phone number already exists. Please login instead.' 
      });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create guest
    const guest = await prisma.platformGuest.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email?.trim() || '',
        passwordHash: hashedPassword,
        isPhoneVerified: false,
        isEmailVerified: false,
        isActive: true
      }
    });

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { guestId: guest.guestId, type: 'platform_guest' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      data: {
        guest: {
          guestId: guest.guestId,
          fullName: guest.fullName,
          phone: guest.phone,
          email: guest.email
        },
        token
      }
    });
  } catch (error: any) {
    console.error('❌ Registration Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 🌟 7. PUBLIC GUEST LOGIN
// ============================================================
router.post('/auth/login', async (req: any, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone and password are required' 
      });
    }

    // Find guest by phone
    const guest = await prisma.platformGuest.findUnique({
      where: { phone: phone.trim() }
    });

    if (!guest) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid phone number or password' 
      });
    }

    if (!guest.isActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been deactivated. Please contact support.' 
      });
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, guest.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid phone number or password' 
      });
    }

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { guestId: guest.guestId, type: 'platform_guest' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Login successful!',
      data: {
        guest: {
          guestId: guest.guestId,
          fullName: guest.fullName,
          phone: guest.phone,
          email: guest.email
        },
        token
      }
    });
  } catch (error: any) {
    console.error('❌ Login Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});



export default router;