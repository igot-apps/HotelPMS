import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export const createPayment = async (data: {
  tenantId: number;
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
      tenantId: data.tenantId,
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
          guestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          guest: {
            select: {
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      receiver: {
        select: {
          userId: true,
          fullName: true,
          username: true,
        },
      },
    },
  });
};

export const findPayments = async (
  tenantId: number,
  filters: {
    reservationId?: number;
    paymentMethod?: string;
    status?: string;
    fromDate?: Date;
    toDate?: Date;
  },
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = { tenantId };

  if (filters.reservationId) where.reservationId = filters.reservationId;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.status) where.status = filters.status;
  if (filters.fromDate) where.paymentDate = { gte: filters.fromDate };
  if (filters.toDate) {
    where.paymentDate = { ...where.paymentDate, lte: filters.toDate };
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
            guestId: true,
            totalAmount: true,
            amountPaid: true,
            balanceDue: true,
            guest: {
              select: {
                fullName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        receiver: {
          select: {
            userId: true,
            fullName: true,
            username: true,
          },
        },
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
          guestId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
          guest: {
            select: {
              guestId: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      receiver: {
        select: {
          userId: true,
          fullName: true,
          username: true,
        },
      },
    },
  });
};

export const findPaymentsByReservation = async (reservationId: number) => {
  return prisma.payment.findMany({
    where: { reservationId },
    orderBy: { paymentDate: 'desc' },
    include: {
      receiver: {
        select: {
          userId: true,
          fullName: true,
          username: true,
        },
      },
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
        select: {
          reservationId: true,
          totalAmount: true,
          amountPaid: true,
          balanceDue: true,
        },
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

export const getPaymentStats = async (tenantId: number) => {
  const stats = await prisma.payment.aggregate({
    where: { tenantId },
    _sum: {
      amount: true,
    },
    _count: {
      paymentId: true,
    },
  });

  const methodStats = await prisma.payment.groupBy({
    by: ['paymentMethod'],
    where: { tenantId },
    _sum: {
      amount: true,
    },
    _count: {
      paymentId: true,
    },
  });

  const statusStats = await prisma.payment.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: {
      paymentId: true,
    },
  });

  return {
    totalPayments: stats._count.paymentId,
    totalAmount: stats._sum.amount || 0,
    byMethod: methodStats.map((m) => ({
      method: m.paymentMethod,
      count: m._count.paymentId,
      total: m._sum.amount || 0,
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
      status: 'Completed', // Only count successful payments
    },
    _sum: {
      amount: true,
    },
  });

  // Prisma returns a Decimal object, convert to standard JS Number
  return result._sum.amount ? Number(result._sum.amount) : 0;
};