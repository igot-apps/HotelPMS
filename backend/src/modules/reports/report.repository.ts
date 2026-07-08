import { PrismaClient } from '../../generated/prisma';
const prisma = new PrismaClient();

// Helper to calculate exact nights between two dates
const calculateNights = (checkIn: Date, checkOut: Date): number => {
  const diffTime = Math.ceil(checkOut.getTime() - checkIn.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

// ==========================================
// 1. FINANCIAL & KPI SUMMARY
// ==========================================
export const getFinancialSummary = async (
  tenantId: number,
  propertyId: number | undefined,
  startDate: Date,
  endDate: Date
) => {
  // 1. Get Total Revenue & Transactions for the current period
  const currentPeriod = await prisma.payment.aggregate({
    where: {
      tenantId,
      status: 'Completed',
      paymentDate: { gte: startDate, lte: endDate },
      ...(propertyId && { reservation: { propertyId } }),
    },
    _sum: { amount: true },
    _count: true,
  });

  // 2. Get Total Revenue for the PREVIOUS period (for comparison)
  const periodLength = endDate.getTime() - startDate.getTime();
  const prevStartDate = new Date(startDate.getTime() - periodLength);
  const prevEndDate = new Date(startDate.getTime() - 1); // Day before current start

  const previousPeriod = await prisma.payment.aggregate({
    where: {
      tenantId,
      status: 'Completed',
      paymentDate: { gte: prevStartDate, lte: prevEndDate },
      ...(propertyId && { reservation: { propertyId } }),
    },
    _sum: { amount: true },
  });

  // 3. Calculate Occupancy & Room Nights for ADR/RevPAR
  const daysInRange = calculateNights(startDate, endDate) + 1;
  
  const roomWhere = { tenantId, ...(propertyId && { propertyId }) };
  const totalRooms = await prisma.room.count({ where: roomWhere });
  const totalAvailableNights = totalRooms * daysInRange;

  const occupiedRooms = await prisma.reservationRoom.findMany({
    where: {
      tenantId,
      ...(propertyId && { reservation: { propertyId } }),
      checkInDate: { lte: endDate },
      checkOutDate: { gte: startDate },
      reservation: { status: { notIn: ['Cancelled'] } }
    },
    select: { checkInDate: true, checkOutDate: true, agreedPricePerNight: true }
  });

  let actualOccupiedNights = 0;
  let totalRoomRevenue = 0;

  for (const rr of occupiedRooms) {
    const effectiveIn = rr.checkInDate > startDate ? rr.checkInDate : startDate;
    const effectiveOut = rr.checkOutDate < endDate ? rr.checkOutDate : endDate;
    const nights = calculateNights(effectiveIn, effectiveOut);
    actualOccupiedNights += nights;
    totalRoomRevenue += Number(rr.agreedPricePerNight) * nights;
  }

  const occupancyRate = totalAvailableNights > 0 ? (actualOccupiedNights / totalAvailableNights) * 100 : 0;
  const adr = actualOccupiedNights > 0 ? totalRoomRevenue / actualOccupiedNights : 0;
  const revpar = totalAvailableNights > 0 ? totalRoomRevenue / totalAvailableNights : 0;

  const currentRevenue = currentPeriod._sum.amount ? Number(currentPeriod._sum.amount) : 0;
  const prevRevenue = previousPeriod._sum.amount ? Number(previousPeriod._sum.amount) : 0;
  const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : (currentRevenue > 0 ? 100 : 0);

  return {
    currentRevenue,
    previousRevenue: prevRevenue, // 🚨 FIXED: Changed from `previousRevenue` to `prevRevenue`
    revenueGrowth: parseFloat(revenueGrowth.toFixed(2)),
    totalTransactions: currentPeriod._count,
    occupancyRate: parseFloat(occupancyRate.toFixed(2)),
    adr: parseFloat(adr.toFixed(2)),
    revpar: parseFloat(revpar.toFixed(2)),
    totalAvailableNights,
    actualOccupiedNights,
  };
};

// ==========================================
// 2. TIME-SERIES DATA (For Charts)
// ==========================================
export const getRevenueTimeSeries = async (
  tenantId: number,
  propertyId: number | undefined,
  startDate: Date,
  endDate: Date
) => {
  const payments = await prisma.payment.findMany({
    where: {
      tenantId,
      status: 'Completed',
      paymentDate: { gte: startDate, lte: endDate },
      ...(propertyId && { reservation: { propertyId } }),
    },
    select: {
      paymentDate: true,
      amount: true,
    },
    orderBy: { paymentDate: 'asc' },
  });

  // Group by Date in Node.js (Much easier than Prisma raw SQL date truncation)
  const grouped: Record<string, number> = {};
  
  // Initialize all dates in range to 0 so the chart line doesn't break
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    grouped[dateStr] = 0;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sum the payments
  for (const p of payments) {
    const dateStr = p.paymentDate.toISOString().split('T')[0];
    if (grouped[dateStr] !== undefined) {
      grouped[dateStr] += Number(p.amount);
    }
  }

  // Format for frontend charting
  return Object.entries(grouped).map(([date, total]) => ({
    date,
    total: parseFloat(total.toFixed(2)),
  }));
};

// ==========================================
// 3. CATEGORY BREAKDOWNS
// ==========================================
export const getCategoryBreakdowns = async (
  tenantId: number,
  propertyId: number | undefined,
  startDate: Date,
  endDate: Date
) => {
  // 1. Revenue by Payment Method
  const byMethod = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: {
      tenantId,
      status: 'Completed',
      paymentDate: { gte: startDate, lte: endDate },
      ...(propertyId && { reservation: { propertyId } }),
    },
    _sum: { amount: true },
    _count: true,
  });

  // 🚨 DELETED: The unused `byRoomType` prisma.roomType.groupBy block is gone.

  // 2. Direct query for Room Type revenue (This is the accurate one we actually use)
  const roomTypeRevenue = await prisma.reservationRoom.findMany({
    where: {
      tenantId,
      checkInDate: { lte: endDate },
      checkOutDate: { gte: startDate },
      reservation: { status: { notIn: ['Cancelled'] }, ...(propertyId && { propertyId }) },
    },
    select: {
      roomType: { select: { typeName: true } },
      agreedPricePerNight: true,
      checkInDate: true,
      checkOutDate: true,
    }
  });

  const roomTypeMap: Record<string, number> = {};
  for (const rr of roomTypeRevenue) {
    const nights = calculateNights(
      rr.checkInDate > startDate ? rr.checkInDate : startDate,
      rr.checkOutDate < endDate ? rr.checkOutDate : endDate
    );
    const rev = Number(rr.agreedPricePerNight) * nights;
    roomTypeMap[rr.roomType.typeName] = (roomTypeMap[rr.roomType.typeName] || 0) + rev;
  }

  return {
    byMethod: byMethod.map(m => ({
      method: m.paymentMethod,
      total: m._sum.amount ? Number(m._sum.amount) : 0,
      count: m._count,
    })),
    byRoomType: Object.entries(roomTypeMap).map(([typeName, total]) => ({
      typeName,
      total: parseFloat(total.toFixed(2)),
    })),
  };
};