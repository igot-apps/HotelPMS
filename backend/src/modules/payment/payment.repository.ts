import { PrismaClient } from '../../../src/generated/prisma';
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
          propertyId: true, // ✅ Added for auth checks
          guestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          guest: { select: { fullName: true, email: true, phone: true } },
        },
      },
      receiver: { select: { userId: true, fullName: true, username: true } },
    },
  });
};

export const findPayments = async (
  propertyId: number, // ✅ Replaced tenantId
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
  
  // ✅ Filter by property via the reservation relation
  const where: any = {
    reservation: { propertyId } 
  };

  if (filters.search) {
    const searchStr = String(filters.search);
    const searchNum = parseInt(searchStr);
    where.OR = [
      { gatewayReference: { contains: searchStr, mode: 'insensitive' } },
      { reservation: { guest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { guest: { phone: { contains: searchStr } } } },
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
            propertyId: true, // ✅ Added for auth checks
            guestId: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            guest: { select: { fullName: true, email: true, phone: true } },
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
          propertyId: true, // ✅ Added for auth checks
          guestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          guest: { select: { guestId: true, fullName: true, email: true, phone: true } },
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
      reservation: { select: { propertyId: true } }, // ✅ Added for auth checks
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

export const getPaymentStats = async (propertyId: number) => { 
  // ✅ Base filter for the property
  const baseWhere = { reservation: { propertyId } };

  // ✅ NEW: Filter for actual revenue (ONLY 'Completed' payments)
  const revenueWhere = {
    ...baseWhere,
    status: 'Completed', 
  };

  // 1. Total Revenue & Transactions (Completed only)
  const stats = await prisma.payment.aggregate({
    where: revenueWhere,
    _sum: { amount: true },
    _count: { paymentId: true },
  });

  // 2. Revenue by Payment Method (Completed only)
  const methodStats = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: revenueWhere,
    _sum: { amount: true },
    _count: { paymentId: true },
  });

  // 3. Status breakdown (All payments, to see how many were refunded)
  const statusStats = await prisma.payment.groupBy({
    by: ['status'],
    where: baseWhere,
    _count: { paymentId: true },
  });

  return {
    totalPayments: stats._count.paymentId,
    // ✅ FIXED: Safely convert Prisma Decimal to Number
    totalAmount: stats._sum.amount ? Number(stats._sum.amount) : 0, 
    byMethod: methodStats.map((m) => ({
      method: m.paymentMethod,
      count: m._count.paymentId,
      total: m._sum.amount ? Number(m._sum.amount) : 0,
    })),
    byStatus: statusStats.map((s) => ({
      status: s.status,
      count: s._count.paymentId,
    })),
  };
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