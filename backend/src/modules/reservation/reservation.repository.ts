import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createReservation = async (data: {
  tenantId: number;
  propertyId: number;
  guestId: number;
  staffId?: number;
  source: string;
  checkInDate: Date;
  checkOutDate: Date;
  status?: string;
  notes?: string;
  totalAmount?: number;
  amountPaid?: number;
  balanceDue?: number;
}) => {
  return prisma.reservation.create({
    data: {
      tenantId: data.tenantId,
      propertyId: data.propertyId,
      guestId: data.guestId,
      staffId: data.staffId,
      source: data.source,
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      status: data.status || 'Pending',
      notes: data.notes,
      totalAmount: data.totalAmount,
      amountPaid: data.amountPaid || 0,
      balanceDue: data.balanceDue || 0,
    },
  });
};

export const createReservationRoom = async (data: {
  tenantId: number;
  reservationId: number;
  roomId: number;
  roomTypeId: number;
  ratePlanId?: number;
  checkInDate: Date;
  checkOutDate: Date;
  agreedPricePerNight: number;
}) => {
  return prisma.reservationRoom.create({
    data: {
      tenantId: data.tenantId,
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
  tenantId: number,
  filters: {
    propertyId?: number;
    guestId?: number;
    staffId?: number;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
  },
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = { tenantId };

  if (filters.propertyId) where.propertyId = filters.propertyId;
  if (filters.guestId) where.guestId = filters.guestId;
  if (filters.staffId) where.staffId = filters.staffId;
  if (filters.status) where.status = filters.status;
  if (filters.fromDate) where.checkInDate = { gte: filters.fromDate };
  if (filters.toDate) where.checkOutDate = { lte: filters.toDate };

  const [reservations, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        guest: {
          select: {
            guestId: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        property: {
          select: {
            propertyId: true,
            propertyName: true,
            propertyCode: true,
          },
        },
        staff: {
          select: {
            userId: true,
            fullName: true,
            username: true,
          },
        },
        reservationRooms: {
          include: {
            room: {
              include: {
                roomType: true,
              },
            },
            ratePlan: true,
          },
        },
        payments: true,
        _count: {
          select: {
            payments: true,
          },
        },
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
      guest: {
        select: {
          guestId: true,
          fullName: true,
          email: true,
          phone: true,
          idNumber: true,
          address: true,
        },
      },
      property: {
        select: {
          propertyId: true,
          propertyName: true,
          propertyCode: true,
          address: true,
          city: true,
          country: true,
        },
      },
      staff: {
        select: {
          userId: true,
          fullName: true,
          username: true,
          email: true,
        },
      },
      reservationRooms: {
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
          ratePlan: true,
        },
      },
      payments: {
        orderBy: { paymentDate: 'desc' },
      },
    },
  });
};

export const updateReservation = async (
  reservationId: number,
  data: Partial<{
    guestId: number;
    staffId: number;
    source: string;
    checkInDate: Date;
    checkOutDate: Date;
    status: string;
    notes: string;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
  }>
) => {
  return prisma.reservation.update({
    where: { reservationId },
    data,
  });
};

export const updateReservationStatus = async (
  reservationId: number,
  status: string
) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: { status },
  });
};

export const cancelReservation = async (reservationId: number) => {
  return prisma.reservation.update({
    where: { reservationId },
    data: { status: 'Cancelled' },
  });
};

export const findReservationsByDateRange = async (
  tenantId: number,
  propertyId: number,
  fromDate: Date,
  toDate: Date
) => {
  return prisma.reservation.findMany({
    where: {
      tenantId,
      propertyId,
      OR: [
        {
          AND: [
            { checkInDate: { gte: fromDate } },
            { checkInDate: { lte: toDate } },
          ],
        },
        {
          AND: [
            { checkOutDate: { gte: fromDate } },
            { checkOutDate: { lte: toDate } },
          ],
        },
      ],
      status: {
        notIn: ['Cancelled'],
      },
    },
    include: {
      guest: {
        select: {
          guestId: true,
          fullName: true,
          email: true,
          phone: true,
        },
      },
      reservationRooms: {
        include: {
          room: {
            include: {
              roomType: true,
            },
          },
        },
      },
    },
    orderBy: { checkInDate: 'asc' },
  });
};

export const getReservationStats = async (reservationId: number) => {
  const reservation = await prisma.reservation.findUnique({
    where: { reservationId },
    include: {
      reservationRooms: true,
      payments: true,
    },
  });

  if (!reservation) return null;

  const totalPaid = reservation.payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const nights = Math.ceil(
    (reservation.checkOutDate.getTime() - reservation.checkInDate.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return {
    reservationId: reservation.reservationId,
    totalRooms: reservation.reservationRooms.length,
    totalNights: nights,
    totalAmount: Number(reservation.totalAmount || 0),
    totalPaid,
    balanceDue: Number(reservation.balanceDue || 0),
    paymentStatus: totalPaid >= Number(reservation.totalAmount || 0) ? 'Paid' : 'Partial',
    status: reservation.status,
  };
};

export const updateReservationFinancials = async (
  reservationId: number,
  totalAmount: number,
  amountPaid: number
) => {
  const balanceDue = totalAmount - amountPaid;
  return prisma.reservation.update({
    where: { reservationId },
    data: {
      totalAmount,
      amountPaid,
      balanceDue,
    },
  });
};