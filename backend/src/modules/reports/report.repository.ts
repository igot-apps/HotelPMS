import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const getOccupancyReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: Date,
  toDate: Date
) => {
  // Get all reservations within date range
  const reservations = await prisma.reservation.findMany({
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
      reservationRooms: {
        include: {
          room: true,
        },
      },
    },
  });

  // Get total rooms in property
  const totalRooms = await prisma.room.count({
    where: {
      tenantId,
      propertyId,
      operationalStatus: {
        not: 'OutOfService',
      },
    },
  });

  // Calculate occupied room nights
  let occupiedRoomNights = 0;
  const days = Math.ceil(
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  for (const reservation of reservations) {
    const checkIn = new Date(
      Math.max(reservation.checkInDate.getTime(), fromDate.getTime())
    );
    const checkOut = new Date(
      Math.min(reservation.checkOutDate.getTime(), toDate.getTime())
    );
    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );
    occupiedRoomNights += nights * reservation.reservationRooms.length;
  }

  const totalRoomNights = totalRooms * days;
  const occupancyRate = totalRoomNights > 0 ? (occupiedRoomNights / totalRoomNights) * 100 : 0;

  return {
    totalRooms,
    occupiedRoomNights,
    totalRoomNights,
    occupancyRate: Number(occupancyRate.toFixed(2)),
    days,
    fromDate,
    toDate,
  };
};

export const getRevenueReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: Date,
  toDate: Date
) => {
  // Get payments within date range
  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      paymentDate: {
        gte: fromDate,
        lte: toDate,
      },
      status: 'Completed',
    },
    include: {
      reservation: {
        include: {
          property: true,
          guest: true,
        },
      },
    },
  });

  // Get revenue by payment method
  const byMethod = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: {
      tenantId,
      paymentDate: {
        gte: fromDate,
        lte: toDate,
      },
      status: 'Completed',
    },
    _sum: {
      amount: true,
    },
    _count: {
      paymentId: true,
    },
  });

  // Get revenue by room type (through reservations)
  const byRoomType = await prisma.reservationRoom.groupBy({
    by: ['roomTypeId'],
    where: {
      tenantId,
      reservation: {
        propertyId,
        status: {
          notIn: ['Cancelled'],
        },
        checkInDate: {
          lte: toDate,
        },
        checkOutDate: {
          gte: fromDate,
        },
      },
    },
    _sum: {
      agreedPricePerNight: true,
    },
    _count: {
      reservationRoomId: true,
    },
  });

  // Get room type names
  const roomTypes = await prisma.roomType.findMany({
    where: {
      tenantId,
      propertyId,
    },
    select: {
      roomTypeId: true,
      typeName: true,
    },
  });

  const totalRevenue = payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const byMethodFormatted = byMethod.map((m) => ({
    method: m.paymentMethod,
    count: m._count.paymentId,
    total: Number(m._sum.amount || 0),
  }));

  const byRoomTypeFormatted = byRoomType.map((rt) => {
    const roomType = roomTypes.find((r) => r.roomTypeId === rt.roomTypeId);
    return {
      roomTypeId: rt.roomTypeId,
      roomTypeName: roomType?.typeName || 'Unknown',
      roomNights: rt._count.reservationRoomId,
      revenue: Number(rt._sum.agreedPricePerNight || 0),
    };
  });

  return {
    totalRevenue,
    totalPayments: payments.length,
    byMethod: byMethodFormatted,
    byRoomType: byRoomTypeFormatted,
    fromDate,
    toDate,
  };
};

export const getReservationReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: Date,
  toDate: Date
) => {
  const reservations = await prisma.reservation.findMany({
    where: {
      tenantId,
      propertyId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    },
    include: {
      guest: {
        select: {
          guestId: true,
          fullName: true,
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
        },
      },
      payments: true,
    },
  });

  const byStatus = await prisma.reservation.groupBy({
    by: ['status'],
    where: {
      tenantId,
      propertyId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    },
    _count: {
      reservationId: true,
    },
  });

  const bySource = await prisma.reservation.groupBy({
    by: ['source'],
    where: {
      tenantId,
      propertyId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    },
    _count: {
      reservationId: true,
    },
  });

  const totalAmount = reservations.reduce(
    (sum, r) => sum + Number(r.totalAmount || 0),
    0
  );

  const totalPaid = reservations.reduce(
    (sum, r) => sum + Number(r.amountPaid || 0),
    0
  );

  const averageLength = reservations.reduce((sum, r) => {
    const nights = Math.ceil(
      (r.checkOutDate.getTime() - r.checkInDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return sum + nights;
  }, 0) / (reservations.length || 1);

  return {
    totalReservations: reservations.length,
    totalAmount,
    totalPaid,
    balanceDue: totalAmount - totalPaid,
    averageLengthOfStay: Number(averageLength.toFixed(2)),
    byStatus: byStatus.map((s) => ({
      status: s.status,
      count: s._count.reservationId,
    })),
    bySource: bySource.map((s) => ({
      source: s.source,
      count: s._count.reservationId,
    })),
    reservations,
    fromDate,
    toDate,
  };
};

export const getGuestReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: Date,
  toDate: Date
) => {
  // Get all guests who had reservations in the period
  const guestIds = await prisma.reservation.findMany({
    where: {
      tenantId,
      propertyId,
      checkInDate: {
        lte: toDate,
      },
      checkOutDate: {
        gte: fromDate,
      },
      status: {
        notIn: ['Cancelled'],
      },
    },
    select: {
      guestId: true,
    },
    distinct: ['guestId'],
  });

  const guests = await prisma.guest.findMany({
    where: {
      tenantId,
      guestId: {
        in: guestIds.map((g) => g.guestId),
      },
    },
    include: {
      reservations: {
        where: {
          propertyId,
          checkInDate: {
            lte: toDate,
          },
          checkOutDate: {
            gte: fromDate,
          },
          status: {
            notIn: ['Cancelled'],
          },
        },
        include: {
          payments: true,
          reservationRooms: true,
        },
      },
    },
  });

  const totalGuests = guests.length;
  const returningGuests = guests.filter((g) => g.totalStays > 1).length;
  const newGuests = totalGuests - returningGuests;

  const totalSpent = guests.reduce((sum, g) => {
    const spent = g.reservations.reduce((rs, r) => {
      const paid = r.payments.reduce((ps, p) => ps + Number(p.amount), 0);
      return rs + paid;
    }, 0);
    return sum + spent;
  }, 0);

  return {
    totalGuests,
    newGuests,
    returningGuests,
    returningRate: totalGuests > 0 ? Number(((returningGuests / totalGuests) * 100).toFixed(2)) : 0,
    totalSpent,
    averageSpent: totalGuests > 0 ? Number((totalSpent / totalGuests).toFixed(2)) : 0,
    guests: guests.map((g) => ({
      guestId: g.guestId,
      fullName: g.fullName,
      email: g.email,
      phone: g.phone,
      totalStays: g.totalStays,
      totalSpent: g.reservations.reduce((rs, r) => {
        const paid = r.payments.reduce((ps, p) => ps + Number(p.amount), 0);
        return rs + paid;
      }, 0),
      stays: g.reservations.length,
    })),
    fromDate,
    toDate,
  };
};

export const getDailySummary = async (
  tenantId: number,
  propertyId: number,
  date: Date
) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get today's reservations
  const reservations = await prisma.reservation.findMany({
    where: {
      tenantId,
      propertyId,
      OR: [
        {
          AND: [
            { checkInDate: { gte: startOfDay } },
            { checkInDate: { lte: endOfDay } },
          ],
        },
        {
          AND: [
            { checkOutDate: { gte: startOfDay } },
            { checkOutDate: { lte: endOfDay } },
          ],
        },
      ],
      status: {
        notIn: ['Cancelled'],
      },
    },
    include: {
      guest: true,
      reservationRooms: {
        include: {
          room: true,
        },
      },
      payments: true,
    },
  });

  // Get today's payments
  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      paymentDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: 'Completed',
    },
  });

  const checkIns = reservations.filter((r) => {
    const checkIn = new Date(r.checkInDate);
    return (
      checkIn.getFullYear() === date.getFullYear() &&
      checkIn.getMonth() === date.getMonth() &&
      checkIn.getDate() === date.getDate()
    );
  });

  const checkOuts = reservations.filter((r) => {
    const checkOut = new Date(r.checkOutDate);
    return (
      checkOut.getFullYear() === date.getFullYear() &&
      checkOut.getMonth() === date.getMonth() &&
      checkOut.getDate() === date.getDate()
    );
  });

  // Get current occupancy
  const currentOccupancy = await prisma.room.count({
    where: {
      tenantId,
      propertyId,
      operationalStatus: 'Occupied',
    },
  });

  const totalRooms = await prisma.room.count({
    where: {
      tenantId,
      propertyId,
      operationalStatus: {
        not: 'OutOfService',
      },
    },
  });

  const totalRevenue = payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  return {
    date,
    checkIns: checkIns.length,
    checkOuts: checkOuts.length,
    currentOccupancy,
    totalRooms,
    occupancyRate: totalRooms > 0 ? Number(((currentOccupancy / totalRooms) * 100).toFixed(2)) : 0,
    totalRevenue,
    totalPayments: payments.length,
    averageRate: payments.length > 0 ? Number((totalRevenue / payments.length).toFixed(2)) : 0,
    reservations: reservations.length,
  };
};

export const getMonthlySummary = async (
  tenantId: number,
  propertyId: number,
  month: number,
  year: number
) => {
  // ✅ FIX: Removed unused startDate variable
  const endDate = new Date(year, month, 0);

  // Get all days in month
  const days = [];
  for (let d = 1; d <= endDate.getDate(); d++) {
    days.push(new Date(year, month - 1, d));
  }

  const dailyData = await Promise.all(
    days.map(async (date) => {
      return getDailySummary(tenantId, propertyId, date);
    })
  );

  const summary = dailyData.reduce(
    (acc, day) => {
      if (day) {
        acc.totalCheckIns += day.checkIns;
        acc.totalCheckOuts += day.checkOuts;
        acc.totalRevenue += day.totalRevenue;
        acc.totalPayments += day.totalPayments;
        acc.totalReservations += day.reservations;
      }
      return acc;
    },
    {
      totalCheckIns: 0,
      totalCheckOuts: 0,
      totalRevenue: 0,
      totalPayments: 0,
      totalReservations: 0,
    }
  );

  const averageOccupancy = dailyData.reduce(
    (sum, day) => sum + (day?.occupancyRate || 0),
    0
  ) / dailyData.length;

  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    days: dailyData.length,
    ...summary,
    averageOccupancy: Number(averageOccupancy.toFixed(2)),
    dailyData,
  };
};