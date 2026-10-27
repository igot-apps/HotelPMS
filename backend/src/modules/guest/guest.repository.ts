import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const createGuest = async (data: {
  propertyId: number;
  fullName: string;
  phone?: string | null;
  idNumber?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
}) => {
  return prisma.propertyGuest.create({
    data: {
      propertyId: data.propertyId,
      fullName: data.fullName,
      phone: data.phone,
      idNumber: data.idNumber,
      address: data.address,
      city: data.city,
      country: data.country,
      notes: data.notes,
      isActive: true,
    },
  });
};

export const findGuests = async (
  propertyId: number,
  searchTerm?: string,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = { propertyId, isActive: true };

  if (searchTerm) {
    where.OR = [
      { fullName: { contains: searchTerm, mode: 'insensitive' } },
      { phone: { contains: searchTerm, mode: 'insensitive' } },
      { idNumber: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  const [guests, total] = await Promise.all([
    prisma.propertyGuest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { fullName: 'asc' },
      include: {
        _count: {
          select: {
            reservations: {
              where: {
                // 🌟 CHANGED: Updated to new enum values
                status: { in: ['Confirmed', 'InHouse', 'Completed'] },
              },
            },
          },
        },
      },
    }),
    prisma.propertyGuest.count({ where }),
  ]);

  return { guests, total, page, limit };
};

export const findGuestById = async (guestId: number) => {
  return prisma.propertyGuest.findUnique({
    where: { guestId },
    include: {
      reservations: {
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: { propertyId: true, propertyName: true },
          },
          reservationRooms: {
            include: {
              room: { include: { roomType: true } },
            },
          },
          payments: true,
        },
      },
    },
  });
};

export const findGuestByPhone = async (propertyId: number, phone: string) => {
  return prisma.propertyGuest.findFirst({
    where: { propertyId, phone },
  });
};

export const findGuestByEmail = async (propertyId: number, contact: string) => {
  return prisma.propertyGuest.findFirst({
    where: { 
      propertyId, 
      OR: [{ phone: contact }], 
      isActive: true 
    },
  });
};

export const updateGuest = async (
  guestId: number,
  data: Partial<{
    fullName: string;
    phone: string | null;
    idNumber: string;
    address: string;
    city: string;
    country: string;
    notes: string;
    isActive: boolean;
  }>
) => {
  return prisma.propertyGuest.update({
    where: { guestId },
    data,
  });
};

export const deleteGuest = async (guestId: number) => {
  return prisma.propertyGuest.update({
    where: { guestId },
    data: { isActive: false },
  });
};

export const getGuestStats = async (guestId: number) => {
  const guest = await prisma.propertyGuest.findUnique({
    where: { guestId },
    include: {
      reservations: {
        // 🌟 CHANGED: Updated to new enum values
        where: { status: { in: ['Completed', 'Cancelled'] } },
        include: { payments: true },
      },
    },
  });

  if (!guest) return null;

  // 🌟 CHANGED: 'CheckedOut' is now 'Completed'
  const completedReservations = guest.reservations.filter(
    (r: any) => r.status === 'Completed'
  );

  const totalSpent = guest.reservations.reduce((sum: number, r: any) => {
    const paid = r.payments.reduce((ps: number, p: any) => {
      const amount = typeof p.amount === 'number' ? p.amount : Number(p.amount);
      return ps + amount;
    }, 0);
    return sum + paid;
  }, 0);

  const sortedReservations = [...guest.reservations].sort(
    (a: any, b: any) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
  );
  const lastStayDate = sortedReservations.length > 0 ? sortedReservations[0].checkInDate : null;

  return {
    guestId: guest.guestId,
    fullName: guest.fullName,
    phone: guest.phone,
    totalReservations: guest.reservations.length,
    completedStays: completedReservations.length,
    totalSpent,
    lastStayDate,
    isActive: guest.isActive,
  };
};

export const getGuestReservations = async (guestId: number) => {
  return prisma.reservation.findMany({
    where: { propertyGuestId: guestId },
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { propertyId: true, propertyName: true } },
      reservationRooms: {
        include: {
          room: { include: { roomType: true } },
        },
      },
      payments: true,
    },
  });
};

export const updateGuestLastStay = async (guestId: number) => {
  return prisma.propertyGuest.findUnique({ where: { guestId } });
};
