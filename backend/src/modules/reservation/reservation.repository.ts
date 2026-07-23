import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

export const createReservation = async (data: {
  propertyId: number;
  propertyGuestId?: number | null;
  platformGuestId?: number | null;
  staffId?: number | null;
  source: string;
  checkInDate: Date;
  checkOutDate: Date;
  status?: any; // 🌟 Changed to 'any' to safely accept Prisma Enum
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
  });
};

export const createReservationRoom = async (data: {
  reservationId: number;
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

export const findReservations = async (
  filters: {
    propertyId?: number;
    propertyGuestId?: number;
    platformGuestId?: number;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
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
        reservationRooms: {
          include: {
            room: { include: { roomType: true } },
            ratePlan: true,
          },
        },
        payments: true,
      },
    }),
    prisma.reservation.count({ where }),
  ]);

  return { reservations, total, page, limit };
};

export const findReservationById = async (reservationId: number) => {
  return prisma.reservation.findUnique({
    where: { reservationId },
    include: {
      property: { select: { propertyId: true, propertyName: true, propertyCode: true } },
      propertyGuest: { select: { guestId: true, fullName: true, phone: true } },
      platformGuest: { select: { guestId: true, fullName: true, phone: true, email: true } },
      staff: { select: { userId: true, fullName: true } },
      reservationRooms: {
        include: {
          room: { include: { roomType: true } },
          ratePlan: true,
        },
      },
      payments: true,
    },
  });
};

export const updateReservation = async (reservationId: number, data: any) => {
  return prisma.reservation.update({
    where: { reservationId },
    data,
  });
};

export const updateReservationStatus = async (reservationId: number, status: any) => { // 🌟 Changed to 'any'
  return prisma.reservation.update({
    where: { reservationId },
    data: { status },
  });
};

export const cancelReservation = async (reservationId: number, data: any) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: {
      status: 'Cancelled',
      ...data,
    },
  });
};

export const updateReservationFinancials = async (
  reservationId: number,
  totalAmount: number,
  amountPaid: number
) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: {
      totalAmount,
      amountPaid,
      balanceDue: totalAmount - amountPaid,
    },
  });
};

export const findReservationsByDateRange = async (
  propertyId: number,
  fromDate: Date,
  toDate: Date
) => {
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
    include: {
      reservationRooms: {
        include: { room: true },
      },
    },
  });
};

export const getReservationStats = async (reservationId: number) => {
  return prisma.reservation.findUnique({
    where: { reservationId },
    include: {
      _count: { select: { payments: true } },
      payments: { select: { amount: true } },
    },
  });
};


export const findReservationRoomById = async (reservationRoomId: number) => {
  return prisma.reservationRoom.findUnique({
    where: { reservationRoomId },
    include: {
      reservation: { select: { propertyId: true, status: true } },
      room: { select: { roomId: true, roomNumber: true } },
    },
  });
};

export const updateReservationRoomStatus = async (reservationRoomId: number, data: any) => {
  return prisma.reservationRoom.update({
    where: { reservationRoomId },
    data,
    include: {
      room: { select: { roomNumber: true } },
      roomType: { select: { typeName: true } },
    },
  });
};