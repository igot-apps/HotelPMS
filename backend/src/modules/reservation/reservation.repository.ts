import { PrismaClient } from '../../generated/prisma';
const prisma = new PrismaClient();

// ============================================================
// CREATE RESERVATION
// ============================================================
export const createReservation = async (data: {
  propertyId: number;
  propertyGuestId?: number | null;
  platformGuestId?: number | null;
  staffId?: number | null;
  source: string;
  checkInDate: Date;
  checkOutDate: Date;
  status?: any;
  notes?: string;
  totalAmount?: number;
  amountPaid?: number;
  balanceDue?: number;
}) => {
  return prisma.reservation.create({
    data: {
      propertyId: data.propertyId,
      propertyGuestId: data.propertyGuestId,
      platformGuestId: data.platformGuestId,
      staffId: data.staffId,
      source: data.source,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      status: data.status || 'Pending',
      notes: data.notes,
      totalAmount: data.totalAmount,
      amountPaid: data.amountPaid,
      balanceDue: data.balanceDue,
    },
    include: { reservationRooms: true }
  });
};

// ============================================================
// CREATE RESERVATION ROOM
// ============================================================
export const createReservationRoom = async (data: {
  reservationId: string; // 🌟 CHANGED TO STRING (UUID)
  roomId: number;
  roomTypeId: number;
  ratePlanId?: number | null;
  checkInDate: Date;
  checkOutDate: Date;
  agreedPricePerNight: number;
}) => {
  return prisma.reservationRoom.create({
    data: {
      reservationId: data.reservationId,
      roomId: data.roomId,
      roomTypeId: data.roomTypeId,
      ratePlanId: data.ratePlanId,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      agreedPricePerNight: data.agreedPricePerNight,
    },
  });
};

// ============================================================
// FIND RESERVATIONS (with filters and pagination)
// ============================================================
export const findReservations = async (
  filters: { 
    propertyId?: number; 
    propertyGuestId?: number; 
    platformGuestId?: number; 
    search?: string;
    status?: string; 
    fromDate?: Date; 
    toDate?: Date 
  },
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  if (filters.propertyId) where.propertyId = filters.propertyId;
  if (filters.propertyGuestId !== undefined) where.propertyGuestId = filters.propertyGuestId;
  if (filters.platformGuestId !== undefined) where.platformGuestId = filters.platformGuestId;
  if (filters.status) where.status = filters.status;

  if (filters.search && filters.search.trim() !== '') {
    const searchTerm = filters.search.trim();
    where.OR = [
      { propertyGuest: { fullName: { contains: searchTerm, mode: 'insensitive' } } },
      { platformGuest: { fullName: { contains: searchTerm, mode: 'insensitive' } } },
      { propertyGuest: { phone: { contains: searchTerm } } },
      { platformGuest: { phone: { contains: searchTerm } } },
      { reservationRooms: { some: { room: { roomNumber: { contains: searchTerm, mode: 'insensitive' } } } } },
    ];
  }

  if (filters.fromDate || filters.toDate) {
    where.checkInDate = {};
    if (filters.fromDate) where.checkInDate.gte = filters.fromDate;
    if (filters.toDate) where.checkInDate.lte = filters.toDate;
  }

  const [reservations, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: { propertyId: true, propertyName: true, propertyCode: true } },
        propertyGuest: { select: { guestId: true, fullName: true, phone: true } },
        platformGuest: { select: { guestId: true, fullName: true, phone: true, email: true } },
        staff: { select: { userId: true, fullName: true } },
        reservationRooms: { include: { room: { include: { roomType: true } }, ratePlan: true } },
        payments: true,
      },
    }),
    prisma.reservation.count({ where }),
  ]);
  return { reservations, total, page, limit };
};

// ============================================================
// FIND RESERVATION BY ID
// ============================================================
export const findReservationById = async (reservationId: string) => {
  return prisma.reservation.findUnique({
    where: { reservationId },
    include: {
      property: { select: { propertyId: true, propertyName: true, propertyCode: true } },
      propertyGuest: { select: { guestId: true, fullName: true, phone: true } },
      platformGuest: { select: { guestId: true, fullName: true, phone: true, email: true } },
      staff: { select: { userId: true, fullName: true } },
      reservationRooms: { include: { room: { include: { roomType: true } }, ratePlan: true } },
      payments: true,
    },
  });
};

// ============================================================
// UPDATE RESERVATION
// ============================================================
export const updateReservation = async (reservationId: string, data: any) => {
  return prisma.reservation.update({ where: { reservationId }, data });
};

// ============================================================
// UPDATE RESERVATION STATUS
// ============================================================
export const updateReservationStatus = async (reservationId: string, status: any) => {
  return prisma.reservation.update({ where: { reservationId }, data: { status } });
};

// ============================================================
// CANCEL RESERVATION
// ============================================================
export const cancelReservation = async (reservationId: string, data: any) => {
  return prisma.reservation.update({ where: { reservationId }, data: { status: 'Cancelled', ...data } });
};

// ============================================================
// UPDATE RESERVATION FINANCIALS
// ============================================================
export const updateReservationFinancials = async (reservationId: string, totalAmount: number, amountPaid: number) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: { totalAmount, amountPaid, balanceDue: totalAmount - amountPaid },
  });
};

// ============================================================
// FIND RESERVATIONS BY DATE RANGE
// ============================================================
export const findReservationsByDateRange = async (propertyId: number, fromDate: Date, toDate: Date) => {
  return prisma.reservation.findMany({
    where: {
      propertyId,
      status: { in: ['Confirmed', 'CheckedIn'] },
      OR: [
        { checkInDate: { gte: fromDate, lte: toDate } },
        { checkOutDate: { gte: fromDate, lte: toDate } },
        { checkInDate: { lte: fromDate }, checkOutDate: { gte: toDate } },
      ],
    },
    include: { reservationRooms: { include: { room: true } } },
  });
};

// ============================================================
// GET RESERVATION STATS
// ============================================================
export const getReservationStats = async (reservationId: string) => {
  return prisma.reservation.findUnique({
    where: { reservationId },
    include: { 
      _count: { select: { payments: true } }, 
      payments: { select: { amount: true } } 
    },
  });
};

// ============================================================
// FIND RESERVATION ROOM BY ID
// ============================================================
export const findReservationRoomById = async (reservationRoomId: number) => {
  return prisma.reservationRoom.findUnique({
    where: { reservationRoomId },
    include: { 
      reservation: { select: { propertyId: true, status: true, amountPaid: true } }, 
      room: { select: { roomId: true, roomNumber: true } } 
    },
  });
};

// ============================================================
// UPDATE RESERVATION ROOM STATUS
// ============================================================
export const updateReservationRoomStatus = async (reservationRoomId: number, data: any) => {
  return prisma.reservationRoom.update({
    where: { reservationRoomId },
    data,
    include: { room: { select: { roomNumber: true } }, roomType: { select: { typeName: true } } },
  });
};

// ============================================================
// 🌟 NEW: Check if room is already booked during the extended dates
// ============================================================
export const findConflictingReservationRoom = async (
  roomId: number,
  excludeReservationRoomId: number,
  newCheckOutDate: Date,
  currentCheckOutDate: Date
) => {
  return prisma.reservationRoom.findFirst({
    where: {
      roomId,
      reservationRoomId: { not: excludeReservationRoomId },
      reservation: {
        status: { in: ['Confirmed', 'CheckedIn'] },
        OR: [
          {
            checkInDate: { lte: newCheckOutDate },
            checkOutDate: { gte: currentCheckOutDate }
          }
        ]
      }
    },
    include: {
      room: { select: { roomNumber: true } },
      reservation: {
        select: {
          reservationId: true,
          propertyGuest: { select: { fullName: true } },
          platformGuest: { select: { fullName: true } }
        }
      }
    }
  });
};

// ============================================================
// 🌟 NEW: Update the check-out date for a specific room
// ============================================================
export const updateReservationRoomCheckOutDate = async (
  reservationRoomId: number,
  newCheckOutDate: Date
) => {
  return prisma.reservationRoom.update({
    where: { reservationRoomId },
    data: { checkOutDate: newCheckOutDate },
    include: {
      room: { select: { roomNumber: true } },
      roomType: { select: { typeName: true } },
      reservation: { select: { amountPaid: true } }
    }
  });
};

// ============================================================
// 🚨 SAFETY: Check if a room is already occupied by another active reservation
// ============================================================
export const findConflictingCheckIn = async (roomId: number, excludeReservationRoomId: number) => {
  return prisma.reservationRoom.findFirst({
    where: {
      roomId,
      status: 'CheckedIn',
      reservationRoomId: { not: excludeReservationRoomId },
      reservation: {
        status: { in: ['Confirmed', 'CheckedIn'] }
      }
    },
    include: {
      room: { select: { roomNumber: true } },
      reservation: { 
        select: { 
          reservationId: true,
          propertyGuest: { select: { fullName: true } },
          platformGuest: { select: { fullName: true } }
        } 
      }
    }
  });
};