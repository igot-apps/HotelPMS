Please review them and help me find the issue:

### File: backend/src/modules/paystack
*Could not read file (might be binary or missing)*

### File: backend/src/modules/public/public.routes.ts
```ts
import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import axios from 'axios';

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

    // 🌟 Find a SPECIFIC available room of this type for these dates
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

    // 🌟 Create Reservation Room using the VALID roomId we found
    await prisma.reservationRoom.create({
      data: {
        reservationId: reservation.reservationId,
        roomId: availableRoom.roomId, // ✅ FIXED: Uses actual valid room ID
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
    const { reservationId, email, amount } = req.body; // amount in GHS

    const property = await prisma.property.findUnique({ 
      where: { propertyCode },
      select: { propertyId: true, paystackSecretKey: true, currency: true }
    });

    if (!property?.paystackSecretKey) {
      return res.status(400).json({ success: false, message: 'This hotel has not configured Mobile Money payments yet.' });
    }

    // 🌟 Build callback URL (frontend success page)
    const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/public/${propertyCode}/booking-success`;

    // 🌟 Call Paystack API with callback URL and Mobile Money ONLY
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: Math.round(amount * 100), // Convert GHS to Pesewas
        reference: `RES-${reservationId}-${Date.now()}`,
        currency: property.currency || 'GHS',
        channels: ['mobile_money'], // 🚫 BLOCKS CREDIT CARDS, SHOWS MOBILE MONEY ONLY
        callback_url: callbackUrl, // 🌟 Redirect here after payment
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

    // Verify transaction with Paystack using property's key
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${property.paystackSecretKey}`,
        },
      }
    );

    const transactionData = response.data.data;

    // If payment is successful, update the reservation AND create payment record
    if (transactionData.status === 'success') {
      const reservationId = parseInt(transactionData.metadata?.reservationId);
      const amountPaid = transactionData.amount / 100;

      if (reservationId) {
        // Check if already processed by webhook to prevent duplicates
        const reservation = await prisma.reservation.findUnique({
          where: { reservationId },
          select: { amountPaid: true, status: true }
        });

        // 🛡️ ANTI-DUPLICATE LOCK: Only process if amountPaid is still 0
        if (reservation && Number(reservation.amountPaid) === 0) {
          
          // 🌟 1. Update reservation
          await prisma.reservation.update({
            where: { reservationId },
            data: {
              amountPaid: { increment: amountPaid },
              balanceDue: { decrement: amountPaid },
              status: 'Confirmed',
            }
          });

          // 🌟 2. CREATE PAYMENT RECORD
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

// ============================================================
// 🌟 DISCOVER: Fetch all public properties for the main directory
// ============================================================
router.get('/discover', async (_req: Request, res: Response) => {
  try {
    const properties = await prisma.property.findMany({
      where: { isOnlineBookingEnabled: true },
      select: {
        propertyCode: true,
        propertyName: true,
        city: true,
        publicDescription: true,
        coverImage: true,
        roomTypes: {
          select: { basePrice: true },
          orderBy: { basePrice: 'asc' },
          take: 1 // Get the lowest price
        }
      }
    });

    // Format the data for the frontend
    const formatted = properties.map(p => ({
      propertyCode: p.propertyCode,
      propertyName: p.propertyName,
      city: p.city,
      description: p.publicDescription,
      coverImage: p.coverImage,
      minPrice: p.roomTypes.length > 0 ? Number(p.roomTypes[0].basePrice) : 0,
      rating: 4.5, 
      distance: 'Nearby',
      amenities: ['Free WiFi', 'Parking'] 
    }));

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Discover Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}); 

// ============================================================
// 🌟 DISCOVER: Fetch all public properties for the main directory
// ============================================================
router.get('/discover', async (_req: Request, res: Response) => {
  try {
    const properties = await prisma.property.findMany({
      where: { isOnlineBookingEnabled: true }, // Only fetch hotels open for online booking
      select: {
        propertyCode: true,
        propertyName: true,
        city: true,
        publicDescription: true,
        coverImage: true,
        roomTypes: {
          select: { basePrice: true },
          orderBy: { basePrice: 'asc' },
          take: 1 // Get the lowest price to display as "Starting from"
        }
      }
    });

    // Format the data for the frontend
    const formatted = properties.map(p => ({
      propertyCode: p.propertyCode,
      propertyName: p.propertyName,
      city: p.city,
      description: p.publicDescription,
      coverImage: p.coverImage,
      minPrice: p.roomTypes.length > 0 ? Number(p.roomTypes[0].basePrice) : 0,
      rating: 4.5, // Mock rating (you can add this to your DB later)
      distance: 'Nearby', // Mock distance (you can add this to your DB later)
      amenities: ['Free WiFi', 'Parking'] // Mock amenities (you can link to Amenity table later)
    }));

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('❌ Discover Endpoint Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
```

### File: frontend/src/App.jsx
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Property Registration and PMS Public Pages
import LoginPage from './pages/LoginPage';
import HotelRegistrationWizard from './pages/HotelRegistrationWizard';
import DiscoverPage from './pages/DiscoverPage'; // 🌟 NEW: Main Public Homepage

// 🌟 Public Website Pages (Guest Booking Flow)
import PublicHotelPage from './pages/PublicHotelPage';
import GuestAuthPage from './pages/GuestAuthPage';
import PublicCheckoutPage from './pages/PublicCheckoutPage';
import PublicBookingSuccessPage from './pages/PublicBookingSuccessPage';

// Protected Pages (Staff PMS)
import DashboardPage from './pages/DashboardPage';
import RoomsPage from './pages/RoomsPage';
import GuestsPage from './pages/GuestsPage';
import ReservationsPage from './pages/ReservationsPage';
import PaymentsPage from './pages/PaymentsPage';
import ReportsPage from './pages/ReportsPage';
import RatePlansPage from './pages/RatePlansPage';
import PropertiesPage from './pages/PropertiesPage';
import ReservationDetailsPage from './pages/ReservationDetailsPage';
import CalendarPage from './pages/CalendarPage';
import AvailabilityPage from './pages/AvailabilityPage';
import RoomManagementPage from './pages/RoomManagementPage';
import UsersPage from './pages/UsersPage';
import BillingPage from './pages/BillingPage';

function App() {
  return (
    <BrowserRouter>
      {/* Global Toast Container */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            color: '#1f2937',
            fontWeight: '500',
            padding: '14px 20px',
            fontSize: '14px',
          },
          success: {
            style: {
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#065f46',
            },
            iconTheme: { primary: '#10b981', secondary: '#ffffff' },
          },
          error: {
            style: {
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#991b1b',
            },
            iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          },
        }}
      />

      <Routes>
        {/* ========================================== */}
        {/* 🌟 PUBLIC ROUTES (No login required)       */}
        {/* ========================================== */}
        <Route path="/" element={<DiscoverPage />} /> {/* 🌟 NEW: Main Public Homepage */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register-your-hotel" element={<HotelRegistrationWizard />} />
        
        {/* 🌟 Guest Booking Flow */}
        <Route path="/public/:propertyCode" element={<PublicHotelPage />} />
        <Route path="/public/:propertyCode/auth" element={<GuestAuthPage />} />
        <Route path="/public/:propertyCode/book/:roomTypeId" element={<PublicCheckoutPage />} />
        <Route path="/public/:propertyCode/booking-success" element={<PublicBookingSuccessPage />} />

        {/* ========================================== */}
        {/* 🔒 PROTECTED ROUTES (Wrapped in Layout)    */}
        {/* ========================================== */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/:id" element={<ReservationDetailsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/room-management" element={<RoomManagementPage />} />
          <Route path="/rate-plans" element={<RatePlansPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/billing" element={<BillingPage />} />
        </Route>

        {/* ========================================== */}
        {/* Fallback Route                             */}
        {/* ========================================== */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### File: frontend/src/pages/DiscoverPage.jsx
```jsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane, Dumbbell, Mountain, Loader2, Building2 } from 'lucide-react';

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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicDiscover'],
    queryFn: async () => {
      const res = await api.get('/public/discover');
      return res.data.data || [];
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <Building2 size={48} className="mx-auto text-danger-500 mb-4" />
          <h2 className="text-xl font-bold text-text mb-2">Failed to load hotels</h2>
          <p className="text-text-muted">Please check your connection and try again.</p>
        </div>
      </div>
    );
  }

  const hotels = data || [];

  return (
    <div className="min-h-screen bg-background">
      {/* 🌟 Hero Header */}
      <div className="bg-surface border-b border-border py-16 px-4 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Building2 size={32} className="text-primary-600" />
          <h1 className="text-4xl md:text-5xl font-black text-text tracking-tight">DISCOVER</h1>
        </div>
        <p className="text-lg text-text-muted max-w-2xl mx-auto">
          Find the perfect stay for your next trip. Hand-picked hotels and guesthouses across Ghana, powered by a seamless booking experience.
        </p>
      </div>

      {/* 🌟 Directory Grid */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-text mb-8 flex items-center gap-2">
          <MapPin className="text-primary-600" /> Hotels Near You
        </h2>
        
        {hotels.length === 0 ? (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Building2 size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-text mb-2">No hotels available right now</h3>
            <p className="text-text-muted">Check back later or contact us for assistance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {hotels.map((hotel, index) => (
              <Link 
                key={hotel.propertyCode || index} 
                to={`/public/${hotel.propertyCode}`}
                className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col"
              >
                {/* Image with Fallback */}
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
                        <MapPin size={14} /> {hotel.city}
                      </p>
                    )}
                  </div>

                  {hotel.description && (
                    <p className="text-sm text-text-muted mb-4 line-clamp-2 flex-1">
                      {hotel.description}
                    </p>
                  )}

                  {/* Amenities (Safely mapped) */}
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

### File: frontend/src/pages/mistake-frontend/src/pages/DiscoverPage.jsx
```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane, Dumbbell, Mountain, Loader2 } from 'lucide-react';

// Helper to map amenity strings to icons
const AmenityIcon = ({ name }) => {
  const lower = name.toLowerCase();
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
  // Fetch public properties (We will build this endpoint next)
  const { data, isLoading } = useQuery({
    queryKey: ['publicDiscover'],
    queryFn: async () => {
      const res = await api.get('/public/discover');
      return res.data.data;
    },
    // Fallback to mock data so you can see the UI immediately
    initialData: [
      {
        propertyCode: 'ashaiman-comfort',
        propertyName: 'Ashaiman Comfort Inn',
        city: 'Central, Ashaiman',
        rating: 3.9,
        description: 'No-frills comfort and honest pricing for travelers passing through Ashaiman.',
        amenities: ['Free WiFi', 'Breakfast'],
        minPrice: 320,
        distance: '4.9 km away',
        coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
      },
      {
        propertyCode: 'tema-harbour',
        propertyName: 'Tema Harbour Lodge',
        city: 'Community 1, Tema',
        rating: 4.0,
        description: 'Practical, well-kept lodging close to the port, built for shipping and logistics travelers.',
        amenities: ['Free WiFi', 'Parking'],
        minPrice: 410,
        distance: '11.0 km away',
        coverImage: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80'
      },
      {
        propertyCode: 'east-legon-boutique',
        propertyName: 'East Legon Boutique Inn',
        city: 'East Legon, Accra',
        rating: 4.5,
        description: 'A leafy, residential-feel boutique inn popular with returning diaspora guests.',
        amenities: ['Free WiFi', 'Pool', 'Restaurant'],
        minPrice: 590,
        distance: '13.9 km away',
        coverImage: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80'
      }
    ]
  });

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="bg-surface border-b border-border py-12 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-black text-text tracking-tight mb-4">DISCOVER</h1>
        <p className="text-lg text-text-muted max-w-2xl mx-auto">
          Find the perfect stay for your next trip. Hand-picked hotels and guesthouses across Ghana.
        </p>
      </div>

      {/* Directory Grid */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-text mb-8 flex items-center gap-2">
          <MapPin className="text-primary-600" /> Hotels Near You
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {data.map((hotel) => (
            <Link 
              key={hotel.propertyCode} 
              to={`/public/${hotel.propertyCode}`}
              className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={hotel.coverImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'} 
                  alt={hotel.propertyName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                  <Star size={14} className="text-warning-500 fill-warning-500" />
                  <span className="text-sm font-bold text-text">{hotel.rating}</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col flex-1">
                <div className="mb-3">
                  <h3 className="text-lg font-bold text-text group-hover:text-primary-600 transition-colors">
                    {hotel.propertyName}
                  </h3>
                  <p className="text-sm text-text-muted flex items-center gap-1 mt-1">
                    <MapPin size={14} /> {hotel.city}
                  </p>
                </div>

                <p className="text-sm text-text-muted mb-4 line-clamp-2 flex-1">
                  {hotel.description}
                </p>

                {/* Amenities */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-md border border-secondary-100">
                      <AmenityIcon name={amenity} /> {amenity}
                    </span>
                ))}
                </div>

                {/* Footer: Price & Distance */}
                <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                  <div>
                    <p className="text-xs text-text-muted">Starting from</p>
                    <p className="text-xl font-black text-primary-600">GHS {hotel.minPrice} <span className="text-sm font-normal text-text-muted">/ night</span></p>
                  </div>
                  <span className="text-xs font-semibold text-text-muted bg-background px-2 py-1 rounded border border-border">
                    {hotel.distance}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

