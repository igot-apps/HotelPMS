import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const createGuest = async (data: {
  propertyId: number; // ✅ Replaced tenantId
  fullName: string;
  phone?: string;
  email?: string;
  idNumber?: string;
  address?: string;
  city?: string;
  country?: string;
  username?: string;
  passwordHash?: string;
  notes?: string;
}) => {
  return prisma.guest.create({
    data: {
      propertyId: data.propertyId, // ✅ Replaced tenantId
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      idNumber: data.idNumber,
      address: data.address,
      city: data.city,
      country: data.country,
      username: data.username,
      passwordHash: data.passwordHash,
      notes: data.notes,
      isActive: true,
    },
  });
};

export const findGuests = async (
  propertyId: number, // ✅ Replaced tenantId
  searchTerm?: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = { propertyId, isActive: true }; // ✅ Replaced tenantId
  
  if (searchTerm) {
    where.OR = [
      { fullName: { contains: searchTerm, mode: 'insensitive' } },
      { email: { contains: searchTerm, mode: 'insensitive' } },
      { phone: { contains: searchTerm, mode: 'insensitive' } },
      { idNumber: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  const [guests, total] = await Promise.all([
    prisma.guest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { fullName: 'asc' },
      include: {
        _count: {
          select: {
            reservations: {
              where: {
                status: {
                  in: ['Confirmed', 'CheckedIn', 'CheckedOut'],
                },
              },
            },
          },
        },
      },
    }),
    prisma.guest.count({ where }),
  ]);

  return { guests, total, page, limit };
};

export const findGuestById = async (guestId: number) => {
  return prisma.guest.findUnique({
    where: { guestId },
    include: {
      reservations: {
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              propertyId: true,
              propertyName: true,
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
      },
    },
  });
};

// ✅ Updated to use propertyId instead of tenantId
export const findGuestByEmail = async (propertyId: number, email: string) => {
  return prisma.guest.findFirst({
    where: {
      propertyId, // ✅ Replaced tenantId
      email,
      isActive: true,
    },
  });
};

export const findGuestByUsername = async (username: string) => {
  return prisma.guest.findUnique({
    where: { username },
  });
};

export const updateGuest = async (
  guestId: number,
  data: Partial<{
    fullName: string;
    phone: string;
    email: string;
    idNumber: string;
    address: string;
    city: string;
    country: string;
    username: string;
    passwordHash: string;
    notes: string;
    isActive: boolean;
  }>
) => {
  return prisma.guest.update({
    where: { guestId },
    data,
  });
};

export const deleteGuest = async (guestId: number) => {
  return prisma.guest.update({
    where: { guestId },
    data: { isActive: false },
  });
};

export const getGuestStats = async (guestId: number) => {
  const guest = await prisma.guest.findUnique({
    where: { guestId },
    include: {
      reservations: {
        where: {
          status: {
            in: ['CheckedOut', 'Cancelled'],
          },
        },
        include: {
          payments: true,
        },
      },
    },
  });

  if (!guest) return null;

  const completedReservations = guest.reservations.filter(
    (r) => r.status === 'CheckedOut'
  );

  const totalSpent = guest.reservations.reduce((sum, r) => {
    const paid = r.payments.reduce((ps, p) => {
      const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
      return ps + amount;
    }, 0);
    return sum + paid;
  }, 0);

  return {
    guestId: guest.guestId,
    fullName: guest.fullName,
    email: guest.email,
    phone: guest.phone,
    totalReservations: guest.reservations.length,
    completedStays: completedReservations.length,
    totalSpent,
    dateRegistered: guest.dateRegistered,
    lastStayDate: guest.lastStayDate,
    isActive: guest.isActive,
  };
};

export const getGuestReservations = async (guestId: number) => {
  return prisma.reservation.findMany({
    where: { guestId },
    orderBy: { createdAt: 'desc' },
    include: {
      property: {
        select: {
          propertyId: true,
          propertyName: true,
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
};

export const updateGuestLastStay = async (guestId: number) => {
  return prisma.guest.update({
    where: { guestId },
    data: {
      lastStayDate: new Date(),
      totalStays: {
        increment: 1,
      },
    },
  });
};