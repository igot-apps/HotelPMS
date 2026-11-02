import { Router, Response } from 'express';
import { prisma } from '../../shared/utils/prisma';
import jwt from 'jsonwebtoken'; // Ensure this is imported at the top of the file
import { verifyGuestPayment } from '../payment/guest-payment.service';
import { initializeGuestPayment, checkGuestPaymentStatus } from '../payment/guest-payment-attempt.service';
import { createHotelReservation } from '../reservation/booking-creation.service';
import { expireOnlineHolds } from '../reservation/online-hold.service';
import { cancelGuestReservation } from '../reservation/guest-cancellation.service';


const router = Router();
router.use(async (_req, _res, next) => {
  try { await expireOnlineHolds(); next(); } catch (error) { next(error); }
});

const requireBookingGuest = async (req: any, res: Response, next: import('express').NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new Error();
    let payload: any;
    try {
      payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
      if (process.env.JWT_SECRET) throw error;
      payload = jwt.verify(header.slice(7), 'your-super-secret-key');
    }
    const guestId = payload.type === 'platform_guest' ? payload.guestId
      : payload.type === 'guest' ? payload.platformGuestId : null;
    if (!Number.isSafeInteger(guestId)) throw new Error();
    const guest = await prisma.platformGuest.findUnique({ where: { guestId } });
    if (!guest?.isActive) throw new Error();
    req.bookingGuest = guest;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Please sign in as a guest to book and pay.' });
  }
};

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
    const { search, userLat, userLng, checkIn, checkOut, maxPrice, amenity, page = '1', limit = '9' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 9));
    const skip = (pageNum - 1) * limitNum;
    const hasLocation = userLat !== undefined && userLng !== undefined;
    const latitude = Number(userLat);
    const longitude = Number(userLng);
    if ((userLat !== undefined || userLng !== undefined) && (
      !hasLocation || String(userLat).trim() === '' || String(userLng).trim() === ''
      || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    )) {
      return res.status(400).json({ success: false, message: 'Provide valid latitude and longitude.' });
    }

    if (Boolean(checkIn) !== Boolean(checkOut)) {
      return res.status(400).json({ success: false, message: 'Provide both check-in and check-out dates to search availability.' });
    }
    const checkInDate = checkIn ? new Date(`${String(checkIn)}T00:00:00.000Z`) : null;
    const checkOutDate = checkOut ? new Date(`${String(checkOut)}T00:00:00.000Z`) : null;
    if (checkInDate && checkOutDate && (
      Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate
    )) {
      return res.status(400).json({ success: false, message: 'Check-out must be after check-in.' });
    }

    const where: any = {
      isOnlineBookingEnabled: true,
    };

    const parsedMaxPrice = Number(maxPrice);
    const roomTypeFilter: any = {
      isActive: true,
      rooms: {
        some: {
          operationalStatus: 'Available',
          ...(checkInDate && checkOutDate ? {
            reservationRooms: {
              none: {
                reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } },
                checkInDate: { lt: checkOutDate },
                checkOutDate: { gt: checkInDate },
              }
            }
          } : {})
        }
      }
    };
    if (Number.isFinite(parsedMaxPrice) && parsedMaxPrice > 0) {
      roomTypeFilter.basePrice = { lte: parsedMaxPrice };
    }
    if (amenity && String(amenity).trim()) {
      roomTypeFilter.amenities = {
        some: { amenity: { name: { equals: String(amenity).trim(), mode: 'insensitive' } } }
      };
    }
    where.roomTypes = { some: roomTypeFilter };

    if (search && String(search).trim() !== '') {
      const searchTerm = String(search).trim();
      where.OR = [
        { propertyName: { contains: searchTerm, mode: 'insensitive' } },
        { area: { contains: searchTerm, mode: 'insensitive' } },
        { city: { contains: searchTerm, mode: 'insensitive' } },
        { region: { contains: searchTerm, mode: 'insensitive' } },
        { country: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    let total: number;
    let pageIds: number[] | undefined;
    if (hasLocation) {
      // Rank the entire matching set using lightweight coordinates before loading
      // this page's photos and other large profile fields.
      const candidates = await prisma.property.findMany({
        where, select: { propertyId: true, latitude: true, longitude: true },
      });
      const distance = (hotel: typeof candidates[number]) => hotel.latitude === null || hotel.longitude === null
        ? Infinity : getDistanceKm(latitude, longitude, hotel.latitude, hotel.longitude);
      candidates.sort((a, b) => {
        const aDistance = distance(a), bDistance = distance(b);
        return aDistance === bDistance ? a.propertyId - b.propertyId : aDistance - bDistance;
      });
      total = candidates.length;
      pageIds = candidates.slice(skip, skip + limitNum).map(hotel => hotel.propertyId);
    } else {
      total = await prisma.property.count({ where });
    }

    const properties = await prisma.property.findMany({
      where: pageIds ? { AND: [where, { propertyId: { in: pageIds } }] } : where,
      ...(pageIds ? {} : { skip }),
      take: limitNum,
      orderBy: { propertyId: 'asc' },
      select: {
        propertyId: true,
        propertyCode: true,
        propertyName: true,
        address: true,
        area: true,
        city: true,
        region: true,
        ghanaPostAddress: true,
        country: true,
        publicDescription: true,
        coverImage: true,
        galleryImages: true,
        primaryPhone: true,
        primaryPhoneWhatsappOnly: true,
        latitude: true,
        longitude: true,
        roomTypes: {
          where: roomTypeFilter,
          select: { basePrice: true },
          orderBy: { basePrice: 'asc' },
          take: 1
        },
        amenities: {
          select: { name: true }
        }
      }
    });

    let formatted = await Promise.all(properties.map(async p => {
      let distanceText: string | null = null;
      let distanceKm = Number.POSITIVE_INFINITY;

      if (hasLocation && p.latitude !== null && p.longitude !== null) {
        const km = getDistanceKm(
          latitude,
          longitude,
          p.latitude, 
          p.longitude
        );
        distanceKm = km;
        distanceText = km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
      }

      let availableRooms: number | null = null;
      if (checkInDate && checkOutDate) {
        availableRooms = await prisma.room.count({
          where: {
            propertyId: p.propertyId,
            operationalStatus: 'Available',
            reservationRooms: {
              none: {
                reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } },
                checkInDate: { lt: checkOutDate },
                checkOutDate: { gt: checkInDate },
              }
            }
          }
        });
      }

      return {
        propertyCode: p.propertyCode,
        propertyName: p.propertyName,
        address: p.address,
        area: p.area,
        city: p.city,
        region: p.region,
        ghanaPostAddress: p.ghanaPostAddress,
        country: p.country,
        description: p.publicDescription,
        coverImage: p.coverImage,
        galleryImages: Array.isArray(p.galleryImages) ? p.galleryImages : [],
        primaryPhone: p.primaryPhone,
        primaryPhoneWhatsappOnly: p.primaryPhoneWhatsappOnly,
        minPrice: p.roomTypes.length > 0 ? Number(p.roomTypes[0].basePrice) : 0,
        availableRooms,
        rating: null,
        distance: distanceText,
        distanceKm: distanceKm,
        amenities: p.amenities.map((a: any) => a.name)
      };
    }));

    if (pageIds) {
      const ranks = new Map(pageIds.map((id, index) => [id, index]));
      const codeRanks = new Map(properties.map(hotel => [hotel.propertyCode, ranks.get(hotel.propertyId)!]));
      formatted.sort((a, b) => codeRanks.get(a.propertyCode)! - codeRanks.get(b.propertyCode)!);
    }

    const amenityOptions = await prisma.amenity.findMany({
      where: { property: { isOnlineBookingEnabled: true } },
      select: { name: true },
      distinct: ['name'],
      orderBy: { name: 'asc' },
      take: 30,
    });

    return res.json({ 
      success: true, 
      data: { 
        hotels: formatted, 
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        amenities: amenityOptions.map(item => item.name),
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
router.post('/reservations/:reservationId/cancel', requireBookingGuest, async (req: any, res: Response) => {
  try {
    const data = await cancelGuestReservation(req.params.reservationId, req.bookingGuest.guestId, req.body.reason);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

router.get('/reservations', requireBookingGuest, async (req: any, res: Response) => {
  try {
    // 🌟 1. Extract pagination params
    const { page = '1', limit = '5' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(20, Math.max(1, parseInt(limit as string, 10))); // Cap at 20
    const skip = (pageNum - 1) * limitNum;

    const whereClause = { 
      platformGuestId: req.bookingGuest.guestId,
      source: 'Website'
    };

    // 🌟 2. Get total count for pagination calculations
    const total = await prisma.reservation.count({ where: whereClause });

    // 🌟 3. Get paginated reservations
    const reservations = await prisma.reservation.findMany({
      where: whereClause,
      include: {
        property: { select: { propertyName: true, city: true, propertyCode: true, cancellationPolicy: true } },
        reservationRooms: { include: { roomType: { select: { typeName: true } } } }
      },
      orderBy: [
     { checkInDate: 'desc' },
     { createdAt: 'desc' } 
   ],
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
        address: true, city: true, country: true, primaryPhone: true, primaryPhoneWhatsappOnly: true, primaryEmail: true,
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
              checkInDate: { lt: checkOutDate },
              checkOutDate: { gt: checkInDate },
              reservation: {
                propertyId: property.propertyId,
                // 🌟 CHANGED: 'CheckedIn' → 'InHouse'
                status: { in: ['Pending', 'Confirmed', 'InHouse'] },
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
router.post('/:propertyCode/reservations', requireBookingGuest, async (req: any, res: Response) => {
  try {
    const property = await checkOnlineBookingEnabled(req.params.propertyCode);
    const reservation = await createHotelReservation({ propertyId: property.propertyId, platformGuestId: req.bookingGuest.guestId, roomTypeId: req.body.roomTypeId, checkInDate: req.body.checkInDate, checkOutDate: req.body.checkOutDate, notes: req.body.notes, source: 'Website' }, true);
    return res.status(201).json({ success: true, data: { reservationId: reservation.reservationId, confirmationCode: reservation.confirmationCode, totalAmount: reservation.totalAmount, guestName: req.bookingGuest.fullName } });
  } catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

// ============================================================
// 4. INITIALIZE GUEST PAYMENT
// ============================================================
router.post('/:propertyCode/payments/initialize', requireBookingGuest, async (req: any, res: Response) => {
  try {
    if (typeof req.body.reservationId !== 'string') return res.status(400).json({ success: false, message: 'Reservation ID is required.' });
    return res.json({ success: true, data: await initializeGuestPayment(req.params.propertyCode, req.body.reservationId, req.bookingGuest) });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Could not start payment. Check payment status before retrying.' });
  }
});

router.get('/:propertyCode/reservations/:reservationId/payment-status', requireBookingGuest, async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await checkGuestPaymentStatus(req.params.propertyCode, req.params.reservationId, req.bookingGuest.guestId) });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Could not check payment status. Please try again.' });
  }
});

// ============================================================
// 5. VERIFY GUEST PAYMENT
// ============================================================
router.get('/:propertyCode/payments/verify/:reference', async (req: any, res: Response) => {
  try {
    return res.json(await verifyGuestPayment(req.params.propertyCode, req.params.reference));
  } catch (error: any) {
    console.error('Paystack Verify Error:', error.message);
    return res.status(error.statusCode || 500).json({ success: false, message: 'Could not verify guest payment. Please try again.' });
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
    // ✅ NEW
    const guest = await prisma.platformGuest.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email?.trim() || undefined, // 🌟 Saves as NULL if empty, avoiding unique constraint
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
