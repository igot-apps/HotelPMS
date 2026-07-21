import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

export const getOperationalOverview = async (propertyId: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  // 1. Fetch Today's Arrivals (Check-ins)
  const arrivals = await prisma.reservation.findMany({
    where: {
      propertyId,
      checkInDate: {
        gte: today,
        lte: endOfToday
      },
      status: { in: ['Confirmed', 'CheckedIn'] }
    },
    include: {
      // 🌟 UPDATED: Use new guest relations
      platformGuest: { select: { fullName: true, phone: true } },
      propertyGuest: { select: { fullName: true, phone: true } },
      reservationRooms: {
        include: {
          room: { select: { roomNumber: true } }
        }
      }
    },
    orderBy: { checkInDate: 'asc' }
  });

  // 2. Fetch Today's Departures (Check-outs)
  const departures = await prisma.reservation.findMany({
    where: {
      propertyId,
      checkOutDate: {
        gte: today,
        lte: endOfToday
      },
      status: { in: ['Confirmed', 'CheckedIn'] }
    },
    include: {
      // 🌟 UPDATED: Use new guest relations
      platformGuest: { select: { fullName: true, phone: true } },
      propertyGuest: { select: { fullName: true, phone: true } },
      reservationRooms: {
        include: {
          room: { select: { roomNumber: true } }
        }
      }
    },
    orderBy: { checkOutDate: 'asc' }
  });

  // 3. Room Statistics
  const totalRooms = await prisma.room.count({ where: { propertyId } });
  const availableRooms = await prisma.room.count({ 
    where: { propertyId, operationalStatus: 'Available', housekeepingStatus: 'Clean' } 
  });

// 4. Alerts (Rooms needing attention)
const alerts = await prisma.room.findMany({
  where: {
    propertyId,
    OR: [
      { housekeepingStatus: 'Dirty' },
      { operationalStatus: 'Maintenance' } // ✅ This is now sufficient!
    ]
  },
  select: {
    roomId: true,
    roomNumber: true,
    operationalStatus: true,
    housekeepingStatus: true
  }
});

  // 🌟 HELPER: Reconstruct a virtual 'guest' object so the frontend doesn't need to change
  const formatReservations = (reservations: any[]) => {
    return reservations.map(res => ({
      ...res,
      guest: {
        fullName: res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Unknown Guest',
        phone: res.platformGuest?.phone || res.propertyGuest?.phone || ''
      },
      // Ensure balanceDue is a number for the frontend
      balanceDue: Number(res.balanceDue || 0)
    }));
  };

  return {
    arrivals: formatReservations(arrivals),
    departures: formatReservations(departures),
    roomStats: {
      Total: totalRooms,
      Available: availableRooms,
      Occupied: totalRooms - availableRooms
    },
    totalRooms,
    alerts
  };
};