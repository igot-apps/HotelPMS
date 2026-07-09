import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const getOperationalOverview = async (tenantId: number, propertyId?: number) => {
  // 1. Define "Today" boundaries
  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  const endOfDay = new Date(now.setHours(23, 59, 59, 999));

  const baseWhere = { tenantId, ...(propertyId && { propertyId }) };

  // 2. Fetch Today's Arrivals (Check-ins)
  const arrivals = await prisma.reservation.findMany({
    where: {
      ...baseWhere,
      checkInDate: { gte: startOfDay, lte: endOfDay },
      status: 'Confirmed',
    },
    include: {
      guest: { select: { fullName: true, phone: true } },
      reservationRooms: { include: { room: { select: { roomNumber: true } } } },
    },
    orderBy: { checkInDate: 'asc' },
  });

  // 3. Fetch Today's Departures (Check-outs)
  const departures = await prisma.reservation.findMany({
    where: {
      ...baseWhere,
      checkOutDate: { gte: startOfDay, lte: endOfDay },
      status: 'CheckedIn',
    },
    include: {
      guest: { select: { fullName: true, phone: true } },
      reservationRooms: { include: { room: { select: { roomNumber: true } } } },
    },
    orderBy: { checkOutDate: 'asc' },
  });

  // 4. Room Status Counts
  const roomStatsRaw = await prisma.room.groupBy({
    by: ['operationalStatus'],
    where: baseWhere,
    _count: true,
  });
  
  // Format room stats into a clean object: { Available: 10, Occupied: 5, Maintenance: 1 }
  const roomStats = roomStatsRaw.reduce((acc, curr) => {
    acc[curr.operationalStatus] = curr._count;
    return acc;
  }, {} as Record<string, number>);

  // 5. Housekeeping Alerts (Dirty rooms or Out of Order)
  const alerts = await prisma.room.findMany({
    where: {
      ...baseWhere,
      OR: [
        { housekeepingStatus: 'Dirty' },
        { housekeepingStatus: 'OutOfService' },
        { operationalStatus: 'Maintenance' },
      ],
    },
    select: {
      roomId: true,
      roomNumber: true,
      operationalStatus: true,
      housekeepingStatus: true,
    },
    orderBy: { roomNumber: 'asc' },
  });

  return {
    arrivals,
    departures,
    roomStats,
    alerts,
    totalRooms: Object.values(roomStats).reduce((sum: number, count: any) => sum + count, 0),
  };
};