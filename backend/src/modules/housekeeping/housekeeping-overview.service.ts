import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';
import { ISSUE_CATEGORIES } from './housekeeping-work.service';

/**
 * Cleaner view: rooms in priority order plus expected checkouts and check-ins for the next 7 days.
 * Operational data only: no guest names, phone numbers or money.
 */
const DAY = 86_400_000;
export const SCHEDULE_DAYS = 7;
const ACTIVE = ['Confirmed', 'InHouse'] as any[];
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };

const key = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => key(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY));
const byRoomNumber = (a: { roomNumber: string | null }, b: { roomNumber: string | null }) =>
  (a.roomNumber || '~').localeCompare(b.roomNumber || '~', undefined, { numeric: true });

export function roomGroup(room: { operationalStatus: string; housekeepingStatus: string }) {
  if (room.operationalStatus === 'Maintenance') return 'maintenance';
  if (room.operationalStatus === 'Occupied') return 'occupied';
  return room.housekeepingStatus === 'Dirty' ? 'needs' : 'ready';
}

/** Urgent: a guest is due in today (or is already late). High: due tomorrow. Normal: nothing soon. */
export function cleaningPriority(nextArrival: string | null, today: string) {
  if (nextArrival && nextArrival <= today) return 'urgent';
  if (nextArrival && nextArrival === addDays(today, 1)) return 'high';
  return 'normal';
}

type RoomRow = { roomId: number; roomNumber: string; floor: number | null; operationalStatus: string; housekeepingStatus: string; maintenanceReason?: string | null; updatedAt: Date; roomType?: { typeName: string } | null;
  cleaningStartedById?: number | null; cleaningStartedAt?: Date | null; cleaningStartedBy?: { fullName: string } | null;
  issues?: { issueId: number; category: string; description: string; roomUnsuitable: boolean; createdAt: Date }[] };
type StayRow = { reservationRoomId: number; roomId: number | null; status: string; checkInDate: Date; checkOutDate: Date; roomNumberSnapshot?: string | null; roomTypeNameSnapshot?: string | null; room?: { roomNumber: string } | null; roomType?: { typeName: string } | null };

export function buildHousekeepingOverview(rooms: RoomRow[], stays: StayRow[], today: string) {
  const end = addDays(today, SCHEDULE_DAYS);
  const roomById = new Map(rooms.map(room => [room.roomId, room]));
  // Guests still expected to arrive (not yet checked in, departure still ahead).
  const arrivals = stays.filter(stay => stay.status === 'Reserved' && key(stay.checkOutDate) > today);
  const nextArrivalFor = (roomId: number | null, from: string, exceptStayId?: number) => {
    if (roomId === null) return null;
    const dates = arrivals.filter(s => s.roomId === roomId && s.reservationRoomId !== exceptStayId && key(s.checkInDate) >= from).map(s => key(s.checkInDate));
    // A late arrival (due before today) still counts as due today.
    const late = arrivals.some(s => s.roomId === roomId && s.reservationRoomId !== exceptStayId && key(s.checkInDate) < today && from <= today);
    if (late) return today;
    return dates.sort()[0] || null;
  };
  const roomLabel = (stay: StayRow) => ({
    roomId: stay.roomId,
    roomNumber: stay.room?.roomNumber || stay.roomNumberSnapshot || null,
    roomType: (stay.roomId !== null ? roomById.get(stay.roomId)?.roomType?.typeName : null) || stay.roomType?.typeName || stay.roomTypeNameSnapshot || null,
  });

  const roomRows = rooms.map(room => {
    const group = roomGroup(room);
    const nextArrival = nextArrivalFor(room.roomId, today);
    const inHouse = stays.find(s => s.roomId === room.roomId && s.status === 'CheckedIn');
    const departure = inHouse ? key(inHouse.checkOutDate) : null;
    return {
      roomId: room.roomId, roomNumber: room.roomNumber, floor: room.floor, roomType: room.roomType?.typeName || null,
      operationalStatus: room.operationalStatus, housekeepingStatus: room.housekeepingStatus,
      maintenanceReason: group === 'maintenance' ? room.maintenanceReason || null : null,
      group, priority: group === 'needs' ? cleaningPriority(nextArrival, today) : null,
      nextArrivalDate: nextArrival, departureDate: departure, departureLate: Boolean(departure && departure < today),
      waitingSince: group === 'needs' ? room.updatedAt.toISOString() : null,
      // Only a room still waiting for cleaning can be "in progress".
      cleaning: group === 'needs' && room.cleaningStartedById ? { userId: room.cleaningStartedById, name: room.cleaningStartedBy?.fullName || 'Someone', startedAt: room.cleaningStartedAt?.toISOString() || null } : null,
      issues: (room.issues || []).map(issue => ({ issueId: issue.issueId, category: issue.category, description: issue.description, roomUnsuitable: issue.roomUnsuitable, createdAt: issue.createdAt.toISOString() })),
    };
  });
  roomRows.sort((a, b) => {
    if (a.priority && b.priority) {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
        || (a.nextArrivalDate || '~').localeCompare(b.nextArrivalDate || '~')
        || (a.waitingSince || '').localeCompare(b.waitingSince || '')
        || byRoomNumber(a, b);
    }
    return byRoomNumber(a, b);
  });

  const days = Array.from({ length: SCHEDULE_DAYS }, (_, i) => ({ date: addDays(today, i), checkouts: [] as any[], checkins: [] as any[] }));
  const dayFor = (date: string) => days.find(day => day.date === date);
  for (const stay of stays) {
    const out = key(stay.checkOutDate);
    const inn = key(stay.checkInDate);
    // Expected checkouts: guests in the room now (late ones count today), or due to stay and leave within the window.
    if (stay.status === 'CheckedIn' || (stay.status === 'Reserved' && out > today)) {
      const day = dayFor(out < today ? today : out);
      if (day && out < end) day.checkouts.push({
        ...roomLabel(stay), stayStatus: stay.status, late: out < today,
        nextArrivalDate: nextArrivalFor(stay.roomId, day.date, stay.reservationRoomId),
      });
    }
    if (stay.status === 'Reserved' && out > today) {
      const day = dayFor(inn < today ? today : inn);
      const room = stay.roomId !== null ? roomById.get(stay.roomId) : undefined;
      if (day) day.checkins.push({ ...roomLabel(stay), late: inn < today, roomStatus: room ? roomGroup(room) : null });
    }
  }
  for (const day of days) { day.checkouts.sort(byRoomNumber); day.checkins.sort(byRoomNumber); }
  return { rooms: roomRows, days };
}

export async function getHousekeepingOverview(propertyId: number, now = new Date()) {
  const property = await prisma.property.findUnique({ where: { propertyId }, select: { housekeepingEnabled: true, timezone: true, checkInTime: true, checkOutTime: true } });
  if (!property?.housekeepingEnabled) throw Object.assign(new Error('Housekeeping is off for this property.'), { statusCode: 403 });
  const today = hotelDate(now, property.timezone || 'Africa/Accra');
  const end = new Date(`${addDays(today, SCHEDULE_DAYS)}T00:00:00Z`);
  const [rooms, stays] = await Promise.all([
    prisma.room.findMany({ where: { propertyId }, orderBy: { roomNumber: 'asc' }, select: {
      roomId: true, roomNumber: true, floor: true, operationalStatus: true, housekeepingStatus: true, maintenanceReason: true, updatedAt: true,
      roomType: { select: { typeName: true } },
      cleaningStartedById: true, cleaningStartedAt: true, cleaningStartedBy: { select: { fullName: true } },
      issues: { where: { status: 'Open' }, orderBy: { createdAt: 'desc' }, select: { issueId: true, category: true, description: true, roomUnsuitable: true, createdAt: true } },
    } }),
    prisma.reservationRoom.findMany({
      where: { reservation: { propertyId, status: { in: ACTIVE } }, OR: [{ status: 'CheckedIn' }, { status: 'Reserved', checkInDate: { lt: end } }] },
      select: {
        reservationRoomId: true, roomId: true, status: true, checkInDate: true, checkOutDate: true, roomNumberSnapshot: true, roomTypeNameSnapshot: true,
        room: { select: { roomNumber: true } }, roomType: { select: { typeName: true } },
      },
    }),
  ]);
  return { date: today, checkInTime: property.checkInTime, checkOutTime: property.checkOutTime, issueCategories: ISSUE_CATEGORIES, ...buildHousekeepingOverview(rooms as RoomRow[], stays as StayRow[], today) };
}
