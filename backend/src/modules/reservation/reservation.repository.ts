import { prisma } from '../../shared/utils/prisma';

// ============================================================
// CREATE RESERVATION
// ============================================================
export const createReservation = async (data: {
  propertyId: number;
  propertyGuestId?: number | null;
  platformGuestId?: number | null;
  guestNameSnapshot?: string | null;
  guestPhoneSnapshot?: string | null;
  staffId?: number | null;
  source: string;
  checkInDate: Date;
  checkOutDate: Date;
  status?: any;
  notes?: string;
  totalAmount?: number;
  amountPaid?: number;
  confirmationCode: string; // 🌟 ADDED
}) => {
  return prisma.reservation.create({
    data: {
      propertyId: data.propertyId,
      propertyGuestId: data.propertyGuestId,
      platformGuestId: data.platformGuestId,
      guestNameSnapshot: data.guestNameSnapshot,
      guestPhoneSnapshot: data.guestPhoneSnapshot,
      staffId: data.staffId,
      source: data.source,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      status: data.status || 'Pending',
      notes: data.notes,
      totalAmount: data.totalAmount,
      amountPaid: data.amountPaid,
      confirmationCode: data.confirmationCode, // 🌟 ADDED
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
  const room = await prisma.room.findUnique({
    where: { roomId: data.roomId },
    select: { roomNumber: true, roomType: { select: { typeName: true } } },
  });

  return prisma.reservationRoom.create({
    data: {
      reservationId: data.reservationId,
      roomId: data.roomId,
      roomTypeId: data.roomTypeId,
      ratePlanId: data.ratePlanId,
      roomNumberSnapshot: room?.roomNumber || null,
      roomTypeNameSnapshot: room?.roomType.typeName || null,
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
      { guestNameSnapshot: { contains: searchTerm, mode: 'insensitive' } },
      { guestPhoneSnapshot: { contains: searchTerm } },
      // ✅ FIX: roomNumber is a String in the database, so we always use 'contains'
      { reservationRooms: { some: { room: { roomNumber: { contains: searchTerm, mode: 'insensitive' } } } } },
      { confirmationCode: { contains: searchTerm, mode: 'insensitive' } },
      { reservationId: { contains: searchTerm, mode: 'insensitive' } },
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
        // Preserve the room assignment order when room records are updated (for example, on check-in).
        reservationRooms: {
          orderBy: { reservationRoomId: 'asc' },
          include: { room: { include: { roomType: true } }, ratePlan: true },
        },
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
      reservationRooms: {
        orderBy: { reservationRoomId: 'asc' },
        include: { room: { include: { roomType: true } }, ratePlan: true },
      },
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
export const updateReservationFinancials = async (
  reservationId: string,
  totalAmount: number,
  amountPaid: number,
  checkOutDate?: Date
) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: { 
      totalAmount, 
      amountPaid,
      ...(checkOutDate && { checkOutDate }),
      // 🌟 REMOVED: balanceDue is now calculated on-demand
    },
  });
};

// ============================================================
// FIND RESERVATIONS BY DATE RANGE
// ============================================================
export const findReservationsByDateRange = async (propertyId: number, fromDate: Date, toDate: Date) => {
  return prisma.reservation.findMany({
    where: {
      propertyId,
      status: { in: ['Confirmed', 'InHouse'] }, // ✅ NEW: Changed to InHouse
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

export const updateGuestPresence = async (
  reservationRoomId: number,
  action: 'out' | 'returned',
  userId: number,
  propertyId: number,
  expectedReturnAt?: Date
) => {
  return prisma.$transaction(async (tx) => {
    const roomStay = await tx.reservationRoom.findUnique({
      where: { reservationRoomId },
      include: {
        reservation: { select: { propertyId: true, status: true } },
        room: { select: { roomNumber: true } },
      },
    });

    if (!roomStay) throw new Error('Reservation room not found');
    if (roomStay.reservation.propertyId !== propertyId) throw new Error('You do not have access to this reservation room');
    if (roomStay.status !== 'CheckedIn' || roomStay.reservation.status !== 'InHouse') {
      throw new Error('Guest presence can only be changed for a room with a checked-in guest.');
    }

    const expectedPresence = action === 'out' ? 'InRoom' : 'Out';
    const nextPresence = action === 'out' ? 'Out' : 'InRoom';
    if (roomStay.guestPresenceStatus !== expectedPresence) {
      throw new Error(action === 'out' ? 'This guest is already marked out.' : 'This guest is not currently marked out.');
    }

    const now = new Date();
    const updateResult = await tx.reservationRoom.updateMany({
      where: {
        reservationRoomId,
        status: 'CheckedIn',
        guestPresenceStatus: expectedPresence,
      },
      data: {
        guestPresenceStatus: nextPresence,
        guestOutAt: action === 'out' ? now : null,
        expectedReturnAt: action === 'out' ? expectedReturnAt || null : null,
        guestReturnedAt: action === 'returned' ? now : roomStay.guestReturnedAt,
        presenceUpdatedBy: userId,
      },
    });
    if (updateResult.count !== 1) throw new Error('Guest presence changed. Refresh the room and try again.');

    await tx.auditLog.create({
      data: {
        userId,
        action: action === 'out' ? 'GuestMarkedOut' : 'GuestMarkedReturned',
        entityType: 'ReservationRoom',
        entityId: reservationRoomId,
        oldData: {
          guestPresenceStatus: roomStay.guestPresenceStatus,
          guestOutAt: roomStay.guestOutAt?.toISOString() || null,
          expectedReturnAt: roomStay.expectedReturnAt?.toISOString() || null,
        },
        newData: {
          guestPresenceStatus: nextPresence,
          guestOutAt: action === 'out' ? now.toISOString() : null,
          expectedReturnAt: action === 'out' ? expectedReturnAt?.toISOString() || null : null,
          guestReturnedAt: action === 'returned' ? now.toISOString() : roomStay.guestReturnedAt?.toISOString() || null,
          roomNumber: roomStay.room?.roomNumber || null,
        },
      },
    });

    return tx.reservationRoom.findUnique({
      where: { reservationRoomId },
      include: { presenceUpdatedByUser: { select: { fullName: true } } },
    });
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
      checkInDate: { lt: newCheckOutDate },
      checkOutDate: { gt: currentCheckOutDate },
      reservation: {
        status: { in: ['Confirmed', 'InHouse'] }, // 🌟 UPDATED to InHouse
      }
    },
    include: {
      room: { select: { roomNumber: true } },
      reservation: {
        select: {
          reservationId: true,
          guestNameSnapshot: true,
          propertyGuest: { select: { fullName: true } },
          platformGuest: { select: { fullName: true } }
        }
      }
    }
  });
};

// ============================================================
// 🌟 NEW: Update the check-out date for a specific room (and track original)
// ============================================================
export const updateReservationRoomCheckOutDate = async (
  reservationRoomId: number,
  newCheckOutDate: Date,
  originalCheckOutDate?: Date // 🌟 Added to track the first extension
) => {
  return prisma.reservationRoom.update({
    where: { reservationRoomId },
    data: { 
      checkOutDate: newCheckOutDate,
      ...(originalCheckOutDate && { originalCheckOutDate }) // 🌟 Only update if provided
    },
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
      status: 'CheckedIn', // Room status is still 'CheckedIn'
      reservationRoomId: { not: excludeReservationRoomId },
      reservation: {
        status: { in: ['Confirmed', 'InHouse'] } // 🌟 UPDATED to InHouse
      }
    },
    include: {
      room: { select: { roomNumber: true } },
      reservation: { 
        select: { 
          reservationId: true,
          guestNameSnapshot: true,
          propertyGuest: { select: { fullName: true } },
          platformGuest: { select: { fullName: true } }
        } 
      }
    }
  });
};

// ============================================================
// 🌟 PHASE 2: DERIVE RESERVATION STATUS FROM ROOMS
// ============================================================
export const deriveReservationStatus = async (reservationId: string) => {
  const rooms = await prisma.reservationRoom.findMany({
    where: { reservationId },
    select: { status: true },
  });

  if (rooms.length === 0) return 'Pending';

  const allCheckedOut = rooms.every(r => r.status === 'CheckedOut');
  const anyCheckedIn = rooms.some(r => r.status === 'CheckedIn');

  if (allCheckedOut) return 'Completed';
  if (anyCheckedIn) return 'InHouse';
  return 'Confirmed';
};

// ============================================================
// 🌟 PHASE 2: MARK RESERVATION AS NO-SHOW
// ============================================================
export const markReservationAsNoShow = async (reservationId: string) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: {
      status: 'NoShow',
      cancellationDate: new Date(),
      // Release all rooms back to Available + Clean
      reservationRooms: {
        updateMany: {
          where: { status: 'Reserved' },
          data: { status: 'CheckedOut' }, // Mark as "checked out" so they don't block inventory
        },
      },
    },
    include: {
      reservationRooms: {
        orderBy: { reservationRoomId: 'asc' },
        include: { room: true },
      },
    },
  });
};
