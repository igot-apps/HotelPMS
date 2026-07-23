import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

// ============================================================
// CREATE PAYMENT
// ============================================================
export const createPayment = async (data: {
  reservationId: string; // 🌟 CHANGED TO STRING (UUID)
  amount: number;
  paymentMethod: string;
  paymentDate?: Date;
  gatewayReference?: string;
  receivedBy?: number;
  status?: any;
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
    reservationId?: string; // 🌟 CHANGED TO STRING
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
    where.OR = [
      { gatewayReference: { contains: searchStr, mode: 'insensitive' } },
      { reservation: { platformGuest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { propertyGuest: { fullName: { contains: searchStr, mode: 'insensitive' } } } },
      { reservation: { platformGuest: { phone: { contains: searchStr } } } },
      { reservation: { propertyGuest: { phone: { contains: searchStr } } } },
      { reservationId: searchStr }, // 🌟 CHANGED: reservationId is now a UUID string
    ];
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
export const findPaymentsByReservation = async (reservationId: string) => { // 🌟 CHANGED TO STRING
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
    status: any;
    notes: string;
  }>
) => {
  return prisma.payment.update({
    where: { paymentId },
    data: data as any,
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
export const calculateAccumulatedPayment = async (reservationId: string): Promise<number> => { // 🌟 CHANGED TO STRING
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