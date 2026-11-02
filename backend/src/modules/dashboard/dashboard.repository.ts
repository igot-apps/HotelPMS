import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';

export const getOperationalOverview = async (propertyId: number) => {
  return prisma.$transaction(async tx => {
    const property = await tx.property.findUnique({ where: { propertyId }, select: { timezone: true } });
    if (!property) throw new Error('Hotel not found.');
    const timeZone = property.timezone || 'Africa/Accra';
    const now = new Date();
    const date = hotelDate(now, timeZone);
    // Scheduled stay dates are UTC date-only values; compare them with the hotel's calendar day.
    const tomorrow = new Date(`${date}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const [stays, rooms] = await Promise.all([
      tx.reservationRoom.findMany({
        where: { reservation: { propertyId, status: { in: ['Confirmed', 'InHouse'] } }, OR: [
          { status: 'Reserved', checkInDate: { lt: tomorrow } },
          { status: 'CheckedIn', checkOutDate: { lt: tomorrow } },
        ] },
        include: { room: { select: { roomNumber: true } }, reservation: { include: {
          platformGuest: { select: { fullName: true, phone: true } },
          propertyGuest: { select: { fullName: true, phone: true } },
        } } },
        orderBy: [{ checkInDate: 'asc' }, { reservationRoomId: 'asc' }],
      }),
      tx.room.findMany({ where: { propertyId }, include: { roomType: { select: { isActive: true } },
        reservationRooms: { where: { status: 'CheckedIn', reservation: { status: { in: ['Confirmed', 'InHouse'] } } }, select: { reservationRoomId: true } },
      } }),
    ]);
    const group = (status: string) => {
      const groups = new Map<string, any>();
      for (const stay of stays.filter(s => s.status === status)) {
        const res = stay.reservation;
        const scheduled = status === 'Reserved' ? stay.checkInDate : stay.checkOutDate;
        const overdue = scheduled.toISOString().slice(0, 10) < date;
        const row = groups.get(res.reservationId) || {
          reservationId: res.reservationId, confirmationCode: res.confirmationCode,
          guest: { fullName: res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Unknown guest' },
          balanceDue: Math.max(0, Number(res.totalAmount || 0) - Number(res.amountPaid)),
          overdue: false, reservationRooms: [],
        };
        const { reservation, ...roomStay } = stay;
        row.overdue ||= overdue;
        row.reservationRooms.push({ ...roomStay, overdue });
        groups.set(res.reservationId, row);
      }
      return [...groups.values()].sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.reservationId.localeCompare(b.reservationId));
    };
    const occupied = rooms.filter(r => r.operationalStatus === 'Occupied' || r.reservationRooms.length > 0);
    const ready = rooms.filter(r => r.operationalStatus === 'Available' && !r.reservationRooms.length && r.roomType.isActive && ['Clean', 'Inspected'].includes(r.housekeepingStatus));
    const alerts = rooms.filter(r => r.housekeepingStatus === 'Dirty' || r.operationalStatus === 'Maintenance').map(r => ({ roomId: r.roomId, roomNumber: r.roomNumber, operationalStatus: r.operationalStatus, housekeepingStatus: r.housekeepingStatus }));
    return {
      date, timeZone, generatedAt: now,
      arrivals: group('Reserved'), departures: group('CheckedIn'),
      taskCounts: {
        arrivals: stays.filter(s => s.status === 'Reserved').length,
        departures: stays.filter(s => s.status === 'CheckedIn').length,
        overdueArrivals: stays.filter(s => s.status === 'Reserved' && s.checkInDate.toISOString().slice(0, 10) < date).length,
        overdueDepartures: stays.filter(s => s.status === 'CheckedIn' && s.checkOutDate.toISOString().slice(0, 10) < date).length,
      },
      roomStats: { Total: rooms.length, Available: ready.length, Occupied: occupied.length, Dirty: rooms.filter(r => r.housekeepingStatus === 'Dirty').length, Maintenance: rooms.filter(r => r.operationalStatus === 'Maintenance').length },
      totalRooms: rooms.length, alerts,
    };
  }, { isolationLevel: 'RepeatableRead' });
};