I am working on a feature and introduced a bug. Here are the files I have modified/created since my last working commit. Please review them and help me find the issue:

### File: backend/src/app.ts
```ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

console.log(`Using TypeScript version: ${require('typescript').version}\n`);

// Import modules
import authRoutes from './modules/auth/auth.routes';
import propertyRoutes from './modules/property/property.routes';
import roomRoutes from './modules/room/room.routes';
import guestRoutes from './modules/guest/guest.routes';
import reservationRoutes from './modules/reservation/reservation.routes';
import paymentRoutes from './modules/payment/payment.routes';
import reportRoutes from './modules/reports/report.routes';
import userRoutes from './modules/user/user.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import paystackRoutes from './modules/paystack/paystack.routes'; // 🌟 NEW: Paystack Integration
import amenityRoutes from './modules/amenity/amenity.routes';
import publicRoutes from './modules/public/public.routes';
import publicAuthRoutes from './modules/public/public-auth.routes';

// Load environment variables
dotenv.config();

// Create Express app
const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());

// ⚠️ CRITICAL: Parse raw body specifically for Paystack Webhooks.
// 1. Platform SaaS Billing Webhook
app.use('/api/paystack/webhooks/platform', express.raw({ type: 'application/json' }));

// 2. 🌟 Hotel Guest Booking Webhook (UNCOMMENTED & ACTIVE)
app.use('/api/paystack/webhooks/guest-bookings', express.raw({ type: 'application/json' }));

// Standard JSON parsing for everything else
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// request log
app.use((req, _res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}\n`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Hotel PMS API',
    version: '1.0.0',
    docs: '/api/docs',
  });
});




// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/amenities', amenityRoutes);
app.use('/api/paystack', paystackRoutes); // 🌟 Mount Paystack Routes
app.use('/api/public', publicRoutes); // 🌟 Mount Public Routes
app.use('/api/public/auth', publicAuthRoutes); // 🌟 Mount Public Auth Routes

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start server
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}\n`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}\n`);
  });
}

export default app;
```

### File: backend/src/modules/payment/payment.repository.ts
```ts
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

// ============================================================
// CREATE PAYMENT
// ============================================================
export const createPayment = async (data: {
  reservationId: number;
  amount: number;
  paymentMethod: string;
  paymentDate?: Date;
  gatewayReference?: string;
  receivedBy?: number;
  status?: string;
  notes?: string;
}) => {
  return prisma.payment.create({
    data: {
      reservationId: data.reservationId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate || new Date(),
      gatewayReference: data.gatewayReference,
      receivedBy: data.receivedBy,
      status: data.status || 'Completed',
      notes: data.notes,
    },
    include: {
      reservation: {
        select: {
          reservationId: true,
          propertyId: true,
          platformGuestId: true,
          propertyGuestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          platformGuest: { select: { fullName: true, email: true, phone: true } },
          // 🌟 FIXED: Removed email (PropertyGuest doesn't have email field)
          propertyGuest: { select: { fullName: true, phone: true } },
        },
      },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

// ============================================================
// FIND PAYMENTS (with filters and pagination)
// ============================================================
export const findPayments = async (
  propertyId: number,
  filters: {
    reservationId?: number;
    paymentMethod?: string;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
    search?: string;
  },
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {
    reservation: { propertyId }
  };

  if (filters.search) {
    const searchStr = String(filters.search);
    const searchNum = parseInt(searchStr);
    where.OR = [
      { gatewayReference: { contains: searchStr, mode: 'insensitive' } },
      { reservation: { platformGuest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { propertyGuest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { platformGuest: { phone: { contains: searchStr } } } },
      { reservation: { propertyGuest: { phone: { contains: searchStr } } } },
    ];
    if (!isNaN(searchNum)) {
      where.OR.push({ reservationId: searchNum });
    }
  }

  if (filters.reservationId) where.reservationId = filters.reservationId;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.status) where.status = filters.status;
  
  if (filters.fromDate || filters.toDate) {
    where.paymentDate = {};
    if (filters.fromDate) where.paymentDate.gte = filters.fromDate;
    if (filters.toDate) where.paymentDate.lte = filters.toDate;
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { paymentDate: 'desc' },
      include: {
        reservation: {
          select: {
            reservationId: true,
            propertyId: true,
            platformGuestId: true,
            propertyGuestId: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            platformGuest: { select: { fullName: true, email: true, phone: true } },
            // 🌟 FIXED: Removed email (PropertyGuest doesn't have email field)
            propertyGuest: { select: { fullName: true, phone: true } },
          },
        },
        receiver: { select: { userId: true, fullName: true, username: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, limit };
};

// ============================================================
// FIND PAYMENT BY ID
// ============================================================
export const findPaymentById = async (paymentId: number) => {
  return prisma.payment.findUnique({
    where: { paymentId },
    include: {
      reservation: {
        select: {
          reservationId: true,
          propertyId: true,
          platformGuestId: true,
          propertyGuestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          platformGuest: { select: { guestId: true, fullName: true, email: true, phone: true } },
          // 🌟 FIXED: Removed email (PropertyGuest doesn't have email field)
          propertyGuest: { select: { guestId: true, fullName: true, phone: true } },
        },
      },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

// ============================================================
// FIND PAYMENTS BY RESERVATION
// ============================================================
export const findPaymentsByReservation = async (reservationId: number) => {
  return prisma.payment.findMany({
    where: { reservationId },
    orderBy: { paymentDate: 'desc' },
    include: {
      reservation: { select: { propertyId: true } },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

// ============================================================
// UPDATE PAYMENT
// ============================================================
export const updatePayment = async (
  paymentId: number,
  data: Partial<{
    amount: number;
    paymentMethod: string;
    paymentDate: Date;
    gatewayReference: string;
    status: string;
    notes: string;
  }>
) => {
  return prisma.payment.update({
    where: { paymentId },
    data,
    include: {
      reservation: {
        select: { reservationId: true, propertyId: true, totalAmount: true, amountPaid: true, balanceDue: true },
      },
    },
  });
};

// ============================================================
// DELETE PAYMENT (Soft delete - mark as Refunded)
// ============================================================
export const deletePayment = async (paymentId: number) => {
  return prisma.payment.update({
    where: { paymentId },
    data: { status: 'Refunded' },
  });
};

// ============================================================
// CALCULATE ACCUMULATED PAYMENT
// ============================================================
export const calculateAccumulatedPayment = async (reservationId: number): Promise<number> => {
  const result = await prisma.payment.aggregate({
    where: {
      reservationId: reservationId,
      status: 'Completed',
    },
    _sum: { amount: true },
  });
  return result._sum.amount ? Number(result._sum.amount) : 0;
};

// ============================================================
// GET PAYMENTS (Simple pagination for PaymentsPage)
// ============================================================
export const getPayments = async (propertyId: number, page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  const take = limit;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where: {
        reservation: {
          propertyId: Number(propertyId)
        }
      },
      skip,
      take,
      orderBy: {
        paymentDate: 'desc'
      },
      include: {
        reservation: {
          select: {
            reservationId: true,
            propertyId: true,
            platformGuestId: true,
            propertyGuestId: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            platformGuest: {
              select: {
                guestId: true,
                fullName: true,
                phone: true,
                email: true
              }
            },
            // 🌟 FIXED: Removed email (PropertyGuest doesn't have email field)
            propertyGuest: {
              select: {
                guestId: true,
                fullName: true,
                phone: true
              }
            }
          }
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            username: true
          }
        }
      }
    }),
    prisma.payment.count({
      where: {
        reservation: {
          propertyId: Number(propertyId)
        }
      }
    })
  ]);

  return { payments, total };
};

// ============================================================
// GET PAYMENT STATISTICS (For Dashboard/Reports)
// ============================================================
export const getPaymentStats = async (propertyId: number) => {
  const stats = await prisma.payment.aggregate({
    where: {
      reservation: {
        propertyId: Number(propertyId)
      }
    },
    _sum: {
      amount: true
    },
    _count: {
      amount: true
    }
  });

  const recentPayments = await prisma.payment.findMany({
    where: {
      reservation: {
        propertyId: Number(propertyId)
      }
    },
    orderBy: {
      paymentDate: 'desc'
    },
    take: 5,
    include: {
      reservation: {
        select: {
          reservationId: true,
          confirmationCode: true,
          platformGuest: {
            select: { fullName: true, phone: true }
          },
          // 🌟 FIXED: Removed email (PropertyGuest doesn't have email field)
          propertyGuest: {
            select: { fullName: true, phone: true }
          }
        }
      }
    }
  });

  return {
    totalRevenue: Number(stats._sum.amount) || 0,
    totalTransactions: stats._count.amount || 0,
    recentPayments
  };
};
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

export default router;
```

### File: frontend/src/api/payments.js
```js
// Payment API module
import api from '../lib/axios';
import { getReservations } from './reservations'; // Reusing reservations API for the dropdown

// Fetch payments with pagination
export const getPayments = (params = {}) => {
  return api.get('/payments', { params });
};

// Fetch payment statistics (Total revenue, breakdown by method)
export const getPaymentStats = () => {
  return api.get('/payments/statistics');
};

// Record a new payment
export const recordPayment = (data) => {
  return api.post('/payments', data);
};

// Refund a payment (Soft delete)
export const refundPayment = (id) => {
  return api.delete(`/payments/${id}`);
};

// Helper to get active reservations for the payment dropdown
export const getActiveReservationsForPayment = (propertyId) => {
  return getReservations({ propertyId, limit: 50 });
};
```

### File: frontend/src/components/payments/PaymentModal.jsx
```jsx
import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { getActiveReservationsForPayment } from '../../api/payments';
import { useAuthStore } from '../../store/authStore';

export default function PaymentModal({ isOpen, onClose, onSubmit, isLoading, error }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const [reservations, setReservations] = useState([]);
  const [formData, setFormData] = useState({
    reservationId: '',
    amount: '',
    paymentMethod: 'Cash',
    gatewayReference: '',
    notes: '',
  });

  useEffect(() => {
    if (isOpen && propertyId) {
      getActiveReservationsForPayment(propertyId)
        .then(res => {
          const active = (res.data.data || []).filter(r =>
            r.status !== 'Cancelled' && parseFloat(r.balanceDue) > 0
          );
          setReservations(active);
        })
        .catch(err => console.error(err));
    }
  }, [isOpen, propertyId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      reservationId: parseInt(formData.reservationId),
      amount: parseFloat(formData.amount),
      paymentMethod: formData.paymentMethod,
      gatewayReference: formData.gatewayReference || null,
      notes: formData.notes || null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">Record Payment</h2>
            <p className="text-sm text-text-muted mt-1">Process a payment for a reservation.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Select Reservation *</label>
            <select
              name="reservationId"
              value={formData.reservationId}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
            >
              <option value="">Choose a reservation...</option>
              {reservations.map(r => (
                <option key={r.reservationId} value={r.reservationId}>
                  #{r.reservationId} - {r.platformGuest?.fullName || r.propertyGuest?.fullName || 'Unknown Guest'} (Balance: {parseFloat(r.balanceDue).toFixed(2)} GHS)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Amount (GHS) *</label>
              <input
                type="number"
                step="0.01"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Payment Method *</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Credit/Debit Card</option>
                <option value="MobileMoney">Mobile Money</option>
                <option value="Online">Online Transfer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Gateway / Reference ID</label>
            <input
              type="text"
              name="gatewayReference"
              value={formData.gatewayReference}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g., MM-REF-12345 (Optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
            <input
              type="text"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g., Partial payment for room charge"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### File: frontend/src/components/reservations/ReservationModal.jsx
```jsx
import { useState, useEffect, useRef } from 'react';
import { X, Loader2, AlertCircle, Check, ChevronLeft, ChevronRight, CreditCard, UserPlus, Printer } from 'lucide-react';
import { getAvailableRooms } from '../../api/rooms';
import { getGuests, createGuest } from '../../api/guests';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import ThermalReceiptModal from './ThermalReceiptModal';

export default function ReservationModal({ isOpen, onClose, onSubmit, isLoading, createdReservation, initialData }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const [currentStep, setCurrentStep] = useState(1);
  const [guests, setGuests] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isFetchingRooms, setIsFetchingRooms] = useState(false);
  
  // Receipt States
  const [showReceipt, setShowReceipt] = useState(false);
  
  // Quick Add Guest States
  const [isAddGuestOpen, setIsAddGuestOpen] = useState(false);
  const [isSavingGuest, setIsSavingGuest] = useState(false);
  const [newGuestData, setNewGuestData] = useState({
    fullName: '', phone: '', email: '', idNumber: ''
  });

  // 🌟 CHANGED: guestId → propertyGuestId
  const [formData, setFormData] = useState({
    propertyGuestId: '', checkInDate: '', checkOutDate: '', source: 'Walk-in', notes: '',
    selectedRooms: [], recordPayment: true, amountPaid: '', paymentMethod: 'Cash', gatewayReference: '',
  });

  // 🚨 DATE HELPERS: Prevent past dates
  const today = new Date().toISOString().split('T')[0];
  const getMinCheckOut = (checkIn) => {
    if (!checkIn) return today;
    const nextDay = new Date(checkIn);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.toISOString().split('T')[0];
  };

  // 🌟 UPDATED: Auto-populate dates and smart-step advancement
  useEffect(() => {
    if (isOpen) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      
      const initialCheckIn = initialData?.checkInDate || today;
      const initialCheckOut = initialData?.checkOutDate || tomorrow;
      
      setFormData({
        propertyGuestId: '', // 🌟 CHANGED
        checkInDate: initialCheckIn, 
        checkOutDate: initialCheckOut, 
        source: 'Walk-in', 
        notes: '',
        selectedRooms: [], 
        recordPayment: true, 
        amountPaid: '', 
        paymentMethod: 'Cash', 
        gatewayReference: '',
      });
      
      setCurrentStep(1);
      // 🌟 Fetch Property Guests (walk-in guests)
      getGuests({ limit: 100 }).then(res => setGuests(res.data.data || [])).catch(err => console.error(err));
    }
  }, [isOpen, initialData]);

  // 🌟 UPDATED: Auto-select the rooms when Step 2 loads
  useEffect(() => {
    if (currentStep === 2 && formData.checkInDate && formData.checkOutDate && propertyId) {
      setIsFetchingRooms(true);
      getAvailableRooms(formData.checkInDate, formData.checkOutDate, propertyId)
        .then(res => {
          const rooms = res.data.data || [];
          setAvailableRooms(rooms);
          
          if (initialData?.roomIds && initialData.roomIds.length > 0) {
            const preSelectedRooms = rooms.filter(room => initialData.roomIds.includes(room.roomId));
            setFormData(prev => ({ ...prev, selectedRooms: preSelectedRooms }));
          }
        })
        .catch(err => { console.error(err); setAvailableRooms([]); })
        .finally(() => setIsFetchingRooms(false));
    }
  }, [currentStep, formData.checkInDate, formData.checkOutDate, propertyId, initialData]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const toggleRoomSelection = (room) => {
    const isSelected = formData.selectedRooms.some(r => r.roomId === room.roomId);
    if (isSelected) {
      setFormData({ ...formData, selectedRooms: formData.selectedRooms.filter(r => r.roomId !== room.roomId) });
    } else {
      setFormData({ ...formData, selectedRooms: [...formData.selectedRooms, room] });
    }
  };

  const calculateNights = () => {
    if (formData.checkInDate && formData.checkOutDate) {
      const diff = new Date(formData.checkOutDate) - new Date(formData.checkInDate);
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
  };

  const nights = calculateNights();
  const totalDue = formData.selectedRooms.reduce((acc, room) => acc + (parseFloat(room.roomType.basePrice) * nights), 0);

  // Quick Add Guest Handler
  const handleQuickAddGuest = async (e) => {
    e.preventDefault();
    if (!newGuestData.fullName || !newGuestData.phone) {
      toast.error('Full Name and Phone are required.');
      return;
    }
    setIsSavingGuest(true);
    try {
      const res = await createGuest(newGuestData);
      const createdGuest = res.data.data;
      setGuests(prev => [createdGuest, ...prev]);
      // 🌟 CHANGED: Set propertyGuestId
      setFormData(prev => ({ ...prev, propertyGuestId: String(createdGuest.guestId) }));
      setIsAddGuestOpen(false);
      setNewGuestData({ fullName: '', phone: '', email: '', idNumber: '' });
      toast.success(`${createdGuest.fullName} added and selected!`);
    } catch (err) {
      console.error('Failed to create guest:', err);
    } finally {
      setIsSavingGuest(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      // 🌟 CHANGED: Check propertyGuestId
      if (!formData.propertyGuestId || !formData.checkInDate || !formData.checkOutDate) {
        toast.error('Please fill in Guest, Check-in, and Check-out dates.'); 
        return;
      }
      const todayDate = new Date(); 
      todayDate.setHours(0,0,0,0);
      const checkInDate = new Date(formData.checkInDate); 
      checkInDate.setHours(0,0,0,0);
      
      if (checkInDate < todayDate) {
        toast.error('Check-in date cannot be in the past.'); 
        return;
      }
      if (nights <= 0) { 
        toast.error('Check-out date must be after check-in date.'); 
        return; 
      }
    }
    if (currentStep === 2 && formData.selectedRooms.length === 0) {
      toast.error('Please select at least one room.'); 
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => setCurrentStep(prev => prev - 1);

  const handleSubmit = (e) => {
    e.preventDefault();
    const exactTotal = parseFloat(totalDue.toFixed(2));
    const exactPaid = formData.recordPayment ? parseFloat(parseFloat(formData.amountPaid || 0).toFixed(2)) : 0;
    
    const payload = {
      propertyId, 
      // 🌟 CHANGED: Send propertyGuestId instead of guestId
      propertyGuestId: parseInt(formData.propertyGuestId), 
      staffId: user?.userId, 
      source: formData.source,
      checkInDate: formData.checkInDate, 
      checkOutDate: formData.checkOutDate, 
      notes: formData.notes,
      rooms: formData.selectedRooms.map(room => ({
        roomId: room.roomId, 
        roomTypeId: room.roomTypeId, 
        agreedPricePerNight: parseFloat(room.roomType.basePrice),
      })),
      amountPaid: 0, 
      initialPayment: exactPaid, 
      paymentMethod: formData.paymentMethod, 
      gatewayReference: formData.gatewayReference || null,
    };
    onSubmit(payload);
  };

  if (!isOpen) return null;

  // ==========================================
  // 🌟 SUCCESS STATE & RECEIPT FLOW
  // ==========================================
  if (createdReservation) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-success-600" />
            </div>
            <h2 className="text-xl font-bold text-text">Reservation Created!</h2>
            <p className="text-text-muted mt-2">
              Reservation <span className="font-bold text-text">#{createdReservation.reservationId}</span> has been successfully saved.
            </p>
            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={() => { setShowReceipt(false); onClose(); }}
                className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition"
              >
                Close
              </button>
              <button
                onClick={() => setShowReceipt(true)}
                className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition flex items-center gap-2"
              >
                <Printer size={16} /> Print Receipt
              </button>
            </div>
          </div>
          {showReceipt && (
            <ThermalReceiptModal
              isOpen={showReceipt}
              onClose={() => setShowReceipt(false)}
              reservation={createdReservation}
              stats={{
                totalAmount: createdReservation.totalAmount,
                totalPaid: createdReservation.amountPaid,
                balanceDue: createdReservation.balanceDue,
              }}
            />
          )}
        </div>
      </div>
    );
  }

  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-4xl rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text">New Reservation</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2">
            <StepIndicator num={1} label="Guest & Dates" active={currentStep >= 1} completed={currentStep > 1} />
            <div className={`w-12 h-0.5 ${currentStep > 1 ? 'bg-primary-500' : 'bg-border'}`} />
            <StepIndicator num={2} label="Select Rooms" active={currentStep >= 2} completed={currentStep > 2} />
            <div className={`w-12 h-0.5 ${currentStep > 2 ? 'bg-primary-500' : 'bg-border'}`} />
            <StepIndicator num={3} label="Confirm & Pay" active={currentStep >= 3} completed={false} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {currentStep === 1 && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Guest *</label>
                <div className="flex gap-2">
                  <SearchableGuestSelect 
                    guests={guests} 
                    // 🌟 CHANGED: propertyGuestId
                    value={formData.propertyGuestId} 
                    onChange={(id) => setFormData(prev => ({ ...prev, propertyGuestId: id }))} 
                  />
                  <button 
                    type="button" 
                    onClick={() => setIsAddGuestOpen(true)} 
                    className="px-4 py-2.5 bg-primary-50 text-primary-600 border border-primary-100 rounded-lg hover:bg-primary-100 transition flex items-center gap-2 font-semibold text-sm whitespace-nowrap"
                    title="Add New Guest"
                  >
                    <UserPlus size={18} /> Add Guest
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Check-in Date *</label>
                  <input 
                    type="date" 
                    name="checkInDate" 
                    min={today} 
                    value={formData.checkInDate} 
                    onChange={handleChange} 
                    required 
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Check-out Date *</label>
                  <input 
                    type="date" 
                    name="checkOutDate" 
                    min={getMinCheckOut(formData.checkInDate)} 
                    value={formData.checkOutDate} 
                    onChange={handleChange} 
                    required 
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Booking Source</label>
                <select name="source" value={formData.source} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                  <option value="Walk-in">Walk-in</option>
                  <option value="Phone">Phone</option>
                  <option value="Website">Website</option>
                  <option value="Direct">Direct</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition resize-none" placeholder="Special requests..." />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="bg-secondary-50 p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-text">Available Rooms</h3>
                  <p className="text-xs text-text-muted">{formatDate(formData.checkInDate)} → {formatDate(formData.checkOutDate)} ({nights} Night{nights > 1 ? 's' : ''})</p>
                </div>
                <p className="text-xs font-semibold text-primary-600">Tick one or more rooms to add to this booking.</p>
              </div>
              {isFetchingRooms ? (
                <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><Loader2 className="animate-spin" size={24} /> Searching...</div>
              ) : availableRooms.length === 0 ? (
                <div className="p-12 text-center text-warning-700 bg-warning-50 rounded-xl border border-warning-100 flex flex-col items-center gap-2"><AlertCircle size={24} /> <p className="font-semibold">No rooms available.</p></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableRooms.map(room => {
                    const isSelected = formData.selectedRooms.some(r => r.roomId === room.roomId);
                    const price = parseFloat(room.roomType.basePrice);
                    return (
                      <button type="button" key={room.roomId} onClick={() => toggleRoomSelection(room)} className={`relative p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/20' : 'border-border bg-background hover:border-primary-300 hover:bg-secondary-50'}`}>
                        {isSelected && <div className="absolute top-2 right-2 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center"><Check size={14} className="text-white" /></div>}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-primary-100 text-primary-700' : 'bg-success-50 text-success-700'}`}>{isSelected ? 'SELECTED' : 'AVAILABLE'}</span>
                          <span className="text-lg font-bold text-text">{room.roomNumber}</span>
                        </div>
                        <p className="text-xs text-text-muted mb-3">Floor {room.floor} · {room.roomType.typeName}</p>
                        <div className="border-t border-border pt-2 mt-auto">
                          <p className="text-sm font-bold text-primary-600">GH₵ {formatCurrency(price)} / night</p>
                          <p className="text-xs text-text-muted">{nights} night{nights > 1 ? 's' : ''} = GH₵ {formatCurrency(price * nights)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="bg-secondary-50 p-5 rounded-xl border border-border">
                <h3 className="text-sm font-bold text-text mb-3">Booking Info</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-text-muted">Guest</p>
                    {/* 🌟 CHANGED: Find by propertyGuestId */}
                    <p className="font-semibold text-text">{guests.find(g => g.guestId == formData.propertyGuestId)?.fullName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Handled By</p>
                    <p className="font-semibold text-text">{user?.fullName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Check-in</p>
                    <p className="font-semibold text-text">{formatDate(formData.checkInDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Check-out</p>
                    <p className="font-semibold text-text">{formatDate(formData.checkOutDate)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border bg-secondary-50/50">
                  <h3 className="text-sm font-bold text-text">Rooms ({formData.selectedRooms.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-secondary-50/30 text-xs text-text-muted uppercase">
                      <tr>
                        <th className="px-4 py-2">Room</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2 text-right">Rate</th>
                        <th className="px-4 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.selectedRooms.map(room => (
                        <tr key={room.roomId} className="border-t border-border">
                          <td className="px-4 py-3 font-bold text-text">Room {room.roomNumber}</td>
                          <td className="px-4 py-3 text-text-muted">{room.roomType.typeName}</td>
                          <td className="px-4 py-3 text-right text-text">{formatCurrency(room.roomType.basePrice)}</td>
                          <td className="px-4 py-3 text-right font-bold text-text">{formatCurrency(parseFloat(room.roomType.basePrice) * nights)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-secondary-50/50 border-t border-border">
                        <td colSpan="3" className="px-4 py-3 text-right text-sm font-bold text-text">Total Due</td>
                        <td className="px-4 py-3 text-right text-lg font-bold text-primary-600">GH₵ {formatCurrency(totalDue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="recordPayment" checked={formData.recordPayment} onChange={(e) => setFormData({ ...formData, recordPayment: e.target.checked, amountPaid: e.target.checked ? totalDue.toFixed(2) : '0' })} className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="recordPayment" className="text-sm font-bold text-text cursor-pointer flex items-center gap-2">
                    <CreditCard size={16} /> Record Initial Payment now
                  </label>
                </div>
                {formData.recordPayment && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">Initial Payment Amount (GH₵)</label>
                        <div className="flex gap-2">
                          <input 
                            type="number" 
                            step="0.01" 
                            name="amountPaid" 
                            value={formData.amountPaid} 
                            onChange={handleChange} 
                            required 
                            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                          />
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, amountPaid: totalDue.toFixed(2)})}
                            className="px-3 py-2 bg-success-50 text-success-700 border border-success-200 rounded-lg text-xs font-bold hover:bg-success-100 transition whitespace-nowrap flex items-center gap-1"
                            title="Set to full amount"
                          >
                            <Check size={12} /> Full Pay
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">Payment Method</label>
                        <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="MobileMoney">Mobile Money</option>
                          <option value="Online">Online</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">Reference (optional)</label>
                        <input type="text" name="gatewayReference" value={formData.gatewayReference} onChange={handleChange} placeholder="e.g. transaction ID" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-secondary-50 rounded-lg border border-border">
                      <span className="text-sm font-semibold text-text">Remaining Balance to Collect:</span>
                      {(() => {
                        const paid = parseFloat(formData.amountPaid || 0);
                        const remaining = totalDue - paid;
                        const isOverdue = remaining > 0.01; 
                        return (
                          <span className={`text-lg font-bold ${isOverdue ? 'text-danger-600' : 'text-success-600'}`}>
                            GH₵ {formatCurrency(Math.max(0, remaining))}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        <div className="p-6 border-t border-border bg-secondary-50/50 flex justify-between">
          <button type="button" onClick={currentStep === 1 ? onClose : prevStep} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-100 transition flex items-center gap-2">
            {currentStep === 1 ? <><X size={16} /> Cancel</> : <><ChevronLeft size={16} /> Back</>}
          </button>
          {currentStep < 3 ? (
            <button type="button" onClick={nextStep} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition flex items-center gap-2">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button type="submit" onClick={handleSubmit} disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-success-600 rounded-lg hover:bg-success-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />} <Check size={16} /> Save Reservation
            </button>
          )}
        </div>
      </div>

      {/* Nested Quick Add Guest Modal */}
      {isAddGuestOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-primary-50/30">
              <h3 className="text-lg font-bold text-text flex items-center gap-2">
                <UserPlus size={20} className="text-primary-600" /> Quick Add Guest
              </h3>
              <button type="button" onClick={() => setIsAddGuestOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 text-text-muted transition">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleQuickAddGuest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Full Name *</label>
                <input type="text" value={newGuestData.fullName} onChange={(e) => setNewGuestData({...newGuestData, fullName: e.target.value})} required placeholder="e.g. Kwame Asante"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Phone Number *</label>
                  <input type="tel" value={newGuestData.phone} onChange={(e) => setNewGuestData({...newGuestData, phone: e.target.value})} required placeholder="0244123456"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">ID Number</label>
                  <input type="text" value={newGuestData.idNumber} onChange={(e) => setNewGuestData({...newGuestData, idNumber: e.target.value})} placeholder="GHA-001"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Email Address</label>
                <input type="email" value={newGuestData.email} onChange={(e) => setNewGuestData({...newGuestData, email: e.target.value})} placeholder="guest@email.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button type="button" onClick={() => setIsAddGuestOpen(false)} className="px-4 py-2 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
                <button type="submit" disabled={isSavingGuest} className="px-4 py-2 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                  {isSavingGuest && <Loader2 className="animate-spin" size={14} />} Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ num, label, active, completed }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${completed ? 'bg-primary-600 text-white' : active ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500/20' : 'bg-secondary-100 text-text-muted'}`}>
        {completed ? <Check size={14} /> : num}
      </div>
      <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-text' : 'text-text-muted'}`}>{label}</span>
    </div>
  );
}

function SearchableGuestSelect({ guests, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  const filteredGuests = guests.filter(g =>
    g.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.phone && g.phone.includes(searchTerm))
  );

  const selectedGuest = guests.find(g => String(g.guestId) === String(value));

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (guestId) => {
    onChange(String(guestId));
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <input
        type="text"
        value={isOpen ? searchTerm : (selectedGuest ? `${selectedGuest.fullName} (${selectedGuest.phone})` : '')}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          if (!isOpen) setIsOpen(true);
          if (!e.target.value) onChange('');
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search by name or phone..."
        className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
      />
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filteredGuests.length > 0 ? (
            filteredGuests.map(g => (
              <button
                key={g.guestId}
                type="button"
                onClick={() => handleSelect(g.guestId)}
                className={`w-full text-left px-4 py-2.5 text-sm transition flex justify-between items-center ${String(g.guestId) === String(value) ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-text hover:bg-secondary-50'}`}
              >
                <span>{g.fullName}</span>
                <span className="text-xs text-text-muted">{g.phone}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-text-muted text-center">
              No guests found. <br/>
              <button type="button" onClick={() => setIsOpen(false)} className="text-primary-600 font-semibold hover:underline mt-1">
                Click "Add Guest" to create one.
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### File: frontend/src/pages/PaymentsPage.jsx
```jsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getPayments, getPaymentStats, recordPayment, refundPayment } from '../api/payments';
import PaymentModal from '../components/payments/PaymentModal';
import {
  Search, Plus, CreditCard, TrendingUp, Banknote, Smartphone, Undo2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import RequirePermission from '../components/RequirePermission';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');

  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'paymentDate';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const status = searchParams.get('status') || '';
  const paymentMethod = searchParams.get('paymentMethod') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        updateParams({ search: localSearch, page: 1 });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['payments', { page, limit, search, sortBy, sortOrder, status, paymentMethod, fromDate, toDate }],
    queryFn: () => {
      const queryParams = { page, limit };
      if (search) queryParams.search = search;
      if (sortBy) queryParams.sortBy = sortBy;
      if (sortOrder) queryParams.sortOrder = sortOrder;
      if (status) queryParams.status = status;
      if (paymentMethod) queryParams.paymentMethod = paymentMethod;
      if (fromDate) queryParams.fromDate = fromDate;
      if (toDate) queryParams.toDate = toDate;
      return getPayments(queryParams).then(res => res.data);
    },
    placeholderData: keepPreviousData,
  });

  const payments = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const totalPages = Math.ceil(pagination.total / limit);
  const startItem = pagination.total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, pagination.total);

  const { data: statsData } = useQuery({
    queryKey: ['paymentStats'],
    queryFn: () => getPaymentStats().then(res => res.data.data),
  });

  const recordMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      setIsModalOpen(false);
    },
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
    },
  });

  const modalError = recordMutation.error?.response?.data?.message || (recordMutation.isError ? 'Failed to record payment.' : null);

  const handleSort = (column) => {
    if (sortBy === column) {
      updateParams({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      updateParams({ sortBy: column, sortOrder: 'asc', page: 1 });
    }
  };

  const handleFilterChange = (key, value) => {
    updateParams({ [key]: value, page: 1 });
  };

  const clearFilters = () => {
    updateParams({ search: '', status: '', paymentMethod: '', fromDate: '', toDate: '', page: 1 });
    setLocalSearch('');
  };

  const hasActiveFilters = status || paymentMethod || fromDate || toDate;

  const handleRefund = (id) => {
    if (window.confirm('Are you sure you want to refund this payment?')) {
      refundMutation.mutate(id);
    }
  };

  const totalRevenue = parseFloat(statsData?.totalRevenue || 0).toFixed(2);
  const totalTx = statsData?.totalTransactions || 0;

  const SortableHeader = ({ column, label }) => {
    const isActive = sortBy === column;
    return (
      <th
        className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:bg-secondary-100/50 transition select-none"
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {label}
          {isActive && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Payments & Revenue</h1>
          <p className="text-text-muted text-sm mt-1">Track transactions, filter records, and process payments.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm"
        >
          <Plus size={16} /> Record Payment
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Total Revenue" value={`${totalRevenue} GHS`} color="primary" />
        <StatCard icon={CreditCard} label="Total Transactions" value={totalTx} color="secondary" />
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Search guest, reservation ID, or reference..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
          </div>
          <select
            value={status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="Refunded">Refunded</option>
          </select>
          <select
            value={paymentMethod}
            onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="MobileMoney">Mobile Money</option>
            <option value="Online">Online</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFilterChange('fromDate', e.target.value)}
              className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleFilterChange('toDate', e.target.value)}
              className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 hover:text-danger-700 transition">
              <X size={14} /> Clear All Filters
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <SortableHeader column="paymentId" label="ID / Date" />
                <SortableHeader column="guestName" label="Guest / Reservation" />
                <SortableHeader column="amount" label="Amount" />
                <SortableHeader column="paymentMethod" label="Method" />
                <SortableHeader column="status" label="Status" />
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted animate-pulse">Loading transactions...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><CreditCard size={24} /> <p className="font-semibold">No payments found</p></td></tr>
              ) : (
                payments.map((p) => {
                  const date = new Date(p.paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const guestName = p.reservation?.platformGuest?.fullName || p.reservation?.propertyGuest?.fullName || 'Unknown Guest';
                  const amount = parseFloat(p.amount || 0).toFixed(2);
                  
                  let methodClass = 'bg-secondary-100 text-secondary-700';
                  if (p.paymentMethod === 'Cash') methodClass = 'bg-success-50 text-success-700';
                  if (p.paymentMethod === 'Card') methodClass = 'bg-primary-50 text-primary-700';
                  if (p.paymentMethod === 'MobileMoney') methodClass = 'bg-warning-50 text-warning-700';
                  
                  const statusClass = p.status === 'Completed'
                    ? 'bg-success-50 text-success-700 ring-1 ring-success-600/20'
                    : 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';

                  return (
                    <tr key={p.paymentId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-text-muted">#{p.paymentId}</p>
                        <p className="text-sm text-text">{date}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-text">{guestName}</p>
                        <p className="text-xs text-text-muted">Res #{p.reservationId}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-text">{amount} GHS</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${methodClass}`}>
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {p.status === 'Completed' ? (
                          <RequirePermission permission="CanIssueRefunds">
                            <button
                              onClick={() => handleRefund(p.paymentId)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"
                            >
                              <Undo2 size={14} /> Refund
                            </button>
                          </RequirePermission>
                        ) : (
                          <span className="text-xs text-text-muted italic">Refunded</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border bg-secondary-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-text-muted">
              Showing <span className="font-semibold text-text">{startItem}</span> to <span className="font-semibold text-text">{endItem}</span> of <span className="font-semibold text-text">{pagination.total}</span> records
            </p>
            <select
              value={limit}
              onChange={(e) => updateParams({ limit: e.target.value, page: 1 })}
              className="text-sm border border-border rounded-lg px-2 py-1 bg-surface text-text outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ page: 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => updateParams({ page: page - 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"><ChevronLeft size={16} /> Prev</button>
            <span className="px-3 py-1 text-sm font-semibold text-text bg-background border border-border rounded-lg min-w-[100px] text-center">
              Page {page} of {totalPages || 1}
            </span>
            <button onClick={() => updateParams({ page: page + 1 })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1">Next <ChevronRight size={16} /></button>
            <button onClick={() => updateParams({ page: totalPages })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      </div>

      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          recordMutation.reset();
        }}
        onSubmit={(data) => recordMutation.mutate(data)}
        isLoading={recordMutation.isPending}
        error={modalError}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    secondary: 'bg-secondary-100 text-secondary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
  };
  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      </div>
      <h3 className="text-2xl font-bold text-text">{value}</h3>
    </div>
  );
}
```

### File: i-help.md
```md
 Please review them and help me find the issue:

### File: backend/src/modules/payment/payment.repository.ts
```ts
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

export const createPayment = async (data: {
  reservationId: number;
  amount: number;
  paymentMethod: string;
  paymentDate?: Date;
  gatewayReference?: string;
  receivedBy?: number;
  status?: string;
  notes?: string;
}) => {
  return prisma.payment.create({
    data: {
      reservationId: data.reservationId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate || new Date(),
      gatewayReference: data.gatewayReference,
      receivedBy: data.receivedBy,
      status: data.status || 'Completed',
      notes: data.notes,
    },
    include: {
      reservation: {
        select: {
          reservationId: true,
          propertyId: true,
          platformGuestId: true,
          propertyGuestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          platformGuest: { select: { fullName: true, email: true, phone: true } },
          propertyGuest: { select: { fullName: true, email: true, phone: true } },
        },
      },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

export const findPayments = async (
  propertyId: number,
  filters: {
    reservationId?: number;
    paymentMethod?: string;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
    search?: string;
  },
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;

  const where: any = {
    reservation: { propertyId }
  };

  if (filters.search) {
    const searchStr = String(filters.search);
    const searchNum = parseInt(searchStr);
    where.OR = [
      { gatewayReference: { contains: searchStr, mode: 'insensitive' } },
      { reservation: { platformGuest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { propertyGuest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { platformGuest: { phone: { contains: searchStr } } } },
      { reservation: { propertyGuest: { phone: { contains: searchStr } } } },
    ];
    if (!isNaN(searchNum)) {
      where.OR.push({ reservationId: searchNum });
    }
  }

  if (filters.reservationId) where.reservationId = filters.reservationId;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.status) where.status = filters.status;

  if (filters.fromDate || filters.toDate) {
    where.paymentDate = {};
    if (filters.fromDate) where.paymentDate.gte = filters.fromDate;
    if (filters.toDate) where.paymentDate.lte = filters.toDate;
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { paymentDate: 'desc' },
      include: {
        reservation: {
          select: {
            reservationId: true,
            propertyId: true,
            platformGuestId: true,
            propertyGuestId: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            platformGuest: { select: { fullName: true, email: true, phone: true } },
            propertyGuest: { select: { fullName: true, email: true, phone: true } },
          },
        },
        receiver: { select: { userId: true, fullName: true, username: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, limit };
};

export const findPaymentById = async (paymentId: number) => {
  return prisma.payment.findUnique({
    where: { paymentId },
    include: {
      reservation: {
        select: {
          reservationId: true,
          propertyId: true,
          platformGuestId: true,
          propertyGuestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          platformGuest: { select: { guestId: true, fullName: true, email: true, phone: true } },
          propertyGuest: { select: { guestId: true, fullName: true, email: true, phone: true } },
        },
      },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

export const findPaymentsByReservation = async (reservationId: number) => {
  return prisma.payment.findMany({
    where: { reservationId },
    orderBy: { paymentDate: 'desc' },
    include: {
      reservation: { select: { propertyId: true } },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

export const updatePayment = async (
  paymentId: number,
  data: Partial<{
    amount: number;
    paymentMethod: string;
    paymentDate: Date;
    gatewayReference: string;
    status: string;
    notes: string;
  }>
) => {
  return prisma.payment.update({
    where: { paymentId },
    data,
    include: {
      reservation: {
        select: { reservationId: true, propertyId: true, totalAmount: true, amountPaid: true, balanceDue: true },
      },
    },
  });
};

export const deletePayment = async (paymentId: number) => {
  return prisma.payment.update({
    where: { paymentId },
    data: { status: 'Refunded' },
  });
};

export const calculateAccumulatedPayment = async (reservationId: number): Promise<number> => {
  const result = await prisma.payment.aggregate({
    where: {
      reservationId: reservationId,
      status: 'Completed',
    },
    _sum: { amount: true },
  });
  return result._sum.amount ? Number(result._sum.amount) : 0;
};

export const getPayments = async (propertyId: number, page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  const take = limit;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where: {
        reservation: {
          propertyId: Number(propertyId)
        }
      },
      skip,
      take,
      orderBy: {
        paymentDate: 'desc'
      },
      include: {
        reservation: {
          select: {
            reservationId: true,
            propertyId: true,
            platformGuestId: true,
            propertyGuestId: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            platformGuest: {
              select: {
                guestId: true,
                fullName: true,
                phone: true,
                email: true
              }
            },
            propertyGuest: {
              select: {
                guestId: true,
                fullName: true,
                phone: true,
                email: true
              }
            }
          }
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            username: true
          }
        }
      }
    }),
    prisma.payment.count({
      where: {
        reservation: {
          propertyId: Number(propertyId)
        }
      }
    })
  ]);

  return { payments, total };
};

export const getPaymentStats = async (propertyId: number) => {
  const stats = await prisma.payment.aggregate({
    where: {
      reservation: {
        propertyId: Number(propertyId)
      }
    },
    _sum: {
      amount: true
    },
    _count: {
      amount: true
    }
  });

  const recentPayments = await prisma.payment.findMany({
    where: {
      reservation: {
        propertyId: Number(propertyId)
      }
    },
    orderBy: {
      paymentDate: 'desc'
    },
    take: 5,
    include: {
      reservation: {
        select: {
          reservationId: true,
          confirmationCode: true,
          platformGuest: {
            select: { fullName: true, phone: true }
          },
          propertyGuest: {
            select: { fullName: true, phone: true }
          }
        }
      }
    }
  });

  return {
    totalRevenue: Number(stats._sum.amount) || 0,
    totalTransactions: stats._count.amount || 0,
    recentPayments
  };
};
```

⚠️  Could not read backend/src/modules/paystack (might be binary or missing)
### File: frontend/src/api/payments.js
```js
//
import api from '../lib/axios';
import { getReservations } from './reservations'; // Reusing reservations API for the dropdown

// Fetch payments with pagination
export const getPayments = (params = {}) => {
  return api.get('/payments', { params });
};

// Fetch payment statistics (Total revenue, breakdown by method)
export const getPaymentStats = () => {
  return api.get('/payments/statistics');
};

// Record a new payment
export const recordPayment = (data) => {
  return api.post('/payments', data);
};

// Refund a payment (Soft delete)
export const refundPayment = (id) => {
  return api.delete(`/payments/${id}`);
};

// Helper to get active reservations for the payment dropdown
export const getActiveReservationsForPayment = (propertyId) => {
  return getReservations({ propertyId, limit: 50 });
};
```

### File: frontend/src/components/payments/PaymentModal.jsx
```jsx
import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { getActiveReservationsForPayment } from '../../api/payments';
import { useAuthStore } from '../../store/authStore';

export default function PaymentModal({ isOpen, onClose, onSubmit, isLoading, error }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  const [reservations, setReservations] = useState([]);
  const [formData, setFormData] = useState({
    reservationId: '',
    amount: '',
    paymentMethod: 'Cash',
    gatewayReference: '',
    notes: '',
  });

  // Load active reservations when modal opens
  useEffect(() => {
    if (isOpen && propertyId) {
      getActiveReservationsForPayment(propertyId)
        .then(res => {
          // Filter out fully paid or cancelled reservations for the dropdown
          const active = (res.data.data || []).filter(r =>
            r.status !== 'Cancelled' && parseFloat(r.balanceDue) > 0
          );
          setReservations(active);
        })
        .catch(err => console.error(err));
    }
  }, [isOpen, propertyId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      reservationId: parseInt(formData.reservationId),
      amount: parseFloat(formData.amount),
      paymentMethod: formData.paymentMethod,
      gatewayReference: formData.gatewayReference || null,
      notes: formData.notes || null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">Record Payment</h2>
            <p className="text-sm text-text-muted mt-1">Process a payment for a reservation.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {error && (
            <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Select Reservation *</label>
            <select name="reservationId" value={formData.reservationId} onChange={handleChange} required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
              <option value="">Choose a reservation...</option>
              {reservations.map(r => (
                <option key={r.reservationId} value={r.reservationId}>
                  #{r.reservationId} - {r.platformGuest?.fullName || r.propertyGuest?.fullName || 'Unknown Guest'} (Balance: {parseFloat(r.balanceDue).toFixed(2)} GHS)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Amount (GHS) *</label>
              <input type="number" step="0.01" name="amount" value={formData.amount} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Payment Method *</label>
              <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                <option value="Cash">Cash</option>
                <option value="Card">Credit/Debit Card</option>
                <option value="MobileMoney">Mobile Money</option>
                <option value="Online">Online Transfer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Gateway / Reference ID</label>
            <input type="text" name="gatewayReference" value={formData.gatewayReference} onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g., MM-REF-12345 (Optional)" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
            <input type="text" name="notes" value={formData.notes} onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g., Partial payment for room charge" />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={isLoading}
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### File: frontend/src/pages/PaymentsPage.jsx
```jsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getPayments, getPaymentStats, recordPayment, refundPayment } from '../api/payments';
import PaymentModal from '../components/payments/PaymentModal';
import {
  Search, Plus, CreditCard, TrendingUp, Banknote, Smartphone, Undo2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import RequirePermission from '../components/RequirePermission';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');

  // ==========================================
  // 1. URL Synchronization (Min/Max Removed)
  // ==========================================
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'paymentDate';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const status = searchParams.get('status') || '';
  const paymentMethod = searchParams.get('paymentMethod') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  // ==========================================
  // 2. Debounced Search Logic
  // ==========================================
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        updateParams({ search: localSearch, page: 1 });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // ==========================================
  // 3. React Query Setup (Min/Max Removed from Key)
  // ==========================================
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['payments', { page, limit, search, sortBy, sortOrder, status, paymentMethod, fromDate, toDate }],
    queryFn: () => {
      const queryParams = { page, limit };
      if (search) queryParams.search = search;
      if (sortBy) queryParams.sortBy = sortBy;
      if (sortOrder) queryParams.sortOrder = sortOrder;
      if (status) queryParams.status = status;
      if (paymentMethod) queryParams.paymentMethod = paymentMethod;
      if (fromDate) queryParams.fromDate = fromDate;
      if (toDate) queryParams.toDate = toDate;

      return getPayments(queryParams).then(res => res.data);
    },
    placeholderData: keepPreviousData,
  });

  const payments = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const totalPages = Math.ceil(pagination.total / limit);
  const startItem = pagination.total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, pagination.total);

  const { data: statsData } = useQuery({
    queryKey: ['paymentStats'],
    queryFn: () => getPaymentStats().then(res => res.data.data),
  });

  // ==========================================
  // 4. Mutations
  // ==========================================
  const recordMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      setIsModalOpen(false);
    },
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const modalError = recordMutation.error?.response?.data?.message || (recordMutation.isError ? 'Failed to record payment.' : null);

  // ==========================================
  // 5. Handlers
  // ==========================================
  const handleSort = (column) => {
    if (sortBy === column) {
      updateParams({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      updateParams({ sortBy: column, sortOrder: 'asc', page: 1 });
    }
  };

  const handleFilterChange = (key, value) => {
    updateParams({ [key]: value, page: 1 });
  };

  const clearFilters = () => {
    updateParams({
      search: '', status: '', paymentMethod: '',
      fromDate: '', toDate: '', page: 1 // Min/Max removed
    });
    setLocalSearch('');
  };

  // Updated to only check the remaining filters
  const hasActiveFilters = status || paymentMethod || fromDate || toDate;

  const handleRefund = (id) => {
    if (window.confirm('Are you sure you want to refund this payment?')) {
      refundMutation.mutate(id);
    }
  };

  const totalRevenue = parseFloat(statsData?.totalAmount || 0).toFixed(2);
  const totalTx = statsData?.totalPayments || 0;
  let cashTotal = 0;
  let digitalTotal = 0;
  if (statsData?.byMethod) {
    statsData.byMethod.forEach(m => {
      const val = parseFloat(m.total || 0);
      if (m.method === 'Cash') cashTotal += val;
      else digitalTotal += val;
    });
  }

  const SortableHeader = ({ column, label }) => {
    const isActive = sortBy === column;
    return (
      <th
        className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:bg-secondary-100/50 transition select-none"
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {label}
          {isActive && (
            sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Payments & Revenue</h1>
          <p className="text-text-muted text-sm mt-1">Track transactions, filter records, and process payments.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> Record Payment
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Total Revenue" value={`${totalRevenue} GHS`} color="primary" />
        <StatCard icon={CreditCard} label="Total Transactions" value={totalTx} color="secondary" />
        <StatCard icon={Banknote} label="Cash Collected" value={`${cashTotal.toFixed(2)} GHS`} color="success" />
        <StatCard icon={Smartphone} label="Digital / Card" value={`${digitalTotal.toFixed(2)} GHS`} color="warning" />
      </div>

      {/* Toolbar: Search & Filters */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Search guest, reservation ID, or reference..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
          </div>

          {/* Quick Filters */}
          <select
            value={status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="Refunded">Refunded</option>
          </select>

          <select
            value={paymentMethod}
            onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="MobileMoney">Mobile Money</option>
            <option value="Online">Online</option>
          </select>
        </div>

        {/* Advanced Filters (Adjusted to 2 columns for Dates only) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFilterChange('fromDate', e.target.value)}
              className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleFilterChange('toDate', e.target.value)}
              className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 hover:text-danger-700 transition">
              <X size={14} /> Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <SortableHeader column="paymentId" label="ID / Date" />
                <SortableHeader column="guestName" label="Guest / Reservation" />
                <SortableHeader column="amount" label="Amount" />
                <SortableHeader column="paymentMethod" label="Method" />
                <SortableHeader column="status" label="Status" />
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted animate-pulse">Loading transactions...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><CreditCard size={24} /> <p className="font-semibold">No payments found</p></td></tr>
              ) : (
                payments.map((p) => {
                  const date = new Date(p.paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const amount = parseFloat(p.amount || 0).toFixed(2);
                  // 🌟 UPDATED: Check both new guest types since we split the Guest model
                  const guestName = p.reservation?.platformGuest?.fullName || p.reservation?.propertyGuest?.fullName || 'Unknown Guest';
                  let methodClass = 'bg-secondary-100 text-secondary-700';
                  if (p.paymentMethod === 'Cash') methodClass = 'bg-success-50 text-success-700';
                  if (p.paymentMethod === 'Card') methodClass = 'bg-primary-50 text-primary-700';
                  if (p.paymentMethod === 'MobileMoney') methodClass = 'bg-warning-50 text-warning-700';

                  const statusClass = p.status === 'Completed'
                    ? 'bg-success-50 text-success-700 ring-1 ring-success-600/20'
                    : 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';

                  return (
                    <tr key={p.paymentId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-text-muted">#{p.paymentId}</p>
                        <p className="text-sm text-text">{date}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-text">{guestName}</p>
                        <p className="text-xs text-text-muted">Res #{p.reservationId}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-text">{amount} GHS</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${methodClass}`}>
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {p.status === 'Completed' ? (
                          // 🚨 CRITICAL: ONLY Managers with 'CanIssueRefunds' can see this button!
                          <RequirePermission permission="CanIssueRefunds">
                            <button
                              onClick={() => handleRefund(p.paymentId)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"
                            >
                              <Undo2 size={14} /> Process Refund
                            </button>
                          </RequirePermission>
                        ) : (
                          <span className="text-xs text-text-muted italic">Refunded</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-border bg-secondary-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-text-muted">
              Showing <span className="font-semibold text-text">{startItem}</span> to <span className="font-semibold text-text">{endItem}</span> of <span className="font-semibold text-text">{pagination.total}</span> records
            </p>
            <select
              value={limit}
              onChange={(e) => updateParams({ limit: e.target.value, page: 1 })}
              className="text-sm border border-border rounded-lg px-2 py-1 bg-surface text-text outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ page: 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => updateParams({ page: page - 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"><ChevronLeft size={16} /> Prev</button>

            <span className="px-3 py-1 text-sm font-semibold text-text bg-background border border-border rounded-lg min-w-[100px] text-center">
              Page {page} of {totalPages || 1}
            </span>

            <button onClick={() => updateParams({ page: page + 1 })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1">Next <ChevronRight size={16} /></button>
            <button onClick={() => updateParams({ page: totalPages })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      </div>

      {/* Modal */}
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          recordMutation.reset();
        }}
        onSubmit={(data) => recordMutation.mutate(data)}
        isLoading={recordMutation.isPending}
        error={modalError}
      />
    </div>
  );
}

// Reusable Stat Card (Unchanged)
function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    secondary: 'bg-secondary-100 text-secondary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
  };

  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      </div>
      <h3 className="text-2xl font-bold text-text">{value}</h3>
    </div>
  );
}

```

