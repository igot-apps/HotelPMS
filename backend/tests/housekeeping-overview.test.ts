import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db = {
  property: { findUnique: mock() },
  room: { findMany: mock(), findUnique: mock(), update: mock() },
  reservationRoom: { findMany: mock(), findFirst: mock() },
  auditLog: { create: mock() },
};
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
// The room repository keeps its own Prisma client; route it to the same mocks.
jest.mock('../src/modules/room/room.repository', () => ({
  findRoomById: (roomId: number) => db.room.findUnique({ where: { roomId } }),
  findActiveCheckedInReservationRoom: () => db.reservationRoom.findFirst(),
  updateRoomStatus: (roomId: number, operationalStatus: string, housekeepingStatus?: string) => db.room.update({ where: { roomId }, data: { operationalStatus, housekeepingStatus } }),
}));

import { buildHousekeepingOverview, cleaningPriority, getHousekeepingOverview } from '../src/modules/housekeeping/housekeeping-overview.service';
import { updateRoomStatus } from '../src/modules/room/room.service';

const d = (date: string) => new Date(`${date}T00:00:00Z`);
const room = (roomId: number, roomNumber: string, operationalStatus: string, housekeepingStatus: string, updatedAt = '2026-11-27T08:00:00Z') =>
  ({ roomId, roomNumber, floor: 1, operationalStatus, housekeepingStatus, maintenanceReason: null, updatedAt: new Date(updatedAt), roomType: { typeName: 'Standard' } });
const stay = (reservationRoomId: number, roomId: number | null, status: string, checkIn: string, checkOut: string) =>
  ({ reservationRoomId, roomId, status, checkInDate: d(checkIn), checkOutDate: d(checkOut), roomNumberSnapshot: null, roomTypeNameSnapshot: 'Standard', room: roomId ? { roomNumber: `R${roomId}` } : null, roomType: null });
const today = '2026-11-27';

beforeEach(() => { jest.clearAllMocks(); });

test('priority: guest due today (or late) is urgent, tomorrow is high, otherwise normal', () => {
  expect(cleaningPriority('2026-11-27', today)).toBe('urgent');
  expect(cleaningPriority('2026-11-25', today)).toBe('urgent');
  expect(cleaningPriority('2026-11-28', today)).toBe('high');
  expect(cleaningPriority('2026-11-30', today)).toBe('normal');
  expect(cleaningPriority(null, today)).toBe('normal');
});

test('rooms needing cleaning come first by priority, then arrival, then longest waiting', () => {
  const rooms = [
    room(1, '101', 'Available', 'Dirty', '2026-11-27T07:00:00Z'), // nothing soon
    room(2, '102', 'Available', 'Dirty', '2026-11-27T09:00:00Z'), // arrival tomorrow
    room(3, '103', 'Available', 'Dirty', '2026-11-27T10:00:00Z'), // arrival today
    room(4, '104', 'Available', 'Dirty', '2026-11-27T06:00:00Z'), // nothing soon, waiting longer
    room(5, '105', 'Available', 'Clean'),
  ];
  const stays = [stay(1, 3, 'Reserved', '2026-11-27', '2026-11-29'), stay(2, 2, 'Reserved', '2026-11-28', '2026-11-30')];
  const { rooms: rows } = buildHousekeepingOverview(rooms, stays, today);
  expect(rows.filter(r => r.group === 'needs').map(r => [r.roomNumber, r.priority])).toEqual([
    ['103', 'urgent'], ['102', 'high'], ['104', 'normal'], ['101', 'normal'],
  ]);
  expect(rows.find(r => r.roomNumber === '105')).toMatchObject({ group: 'ready', priority: null });
});

test('schedule lists expected checkouts (late ones today) and check-ins with room readiness', () => {
  const rooms = [room(1, '101', 'Occupied', 'Clean'), room(2, '102', 'Occupied', 'Clean'), room(3, '103', 'Available', 'Dirty')];
  const stays = [
    stay(1, 1, 'CheckedIn', '2026-11-25', '2026-11-27'), // leaves today
    stay(2, 2, 'CheckedIn', '2026-11-24', '2026-11-26'), // overstay: shown today, late
    stay(3, 1, 'Reserved', '2026-11-27', '2026-11-28'), // same-day turnover in room 101
    stay(4, 3, 'Reserved', '2026-11-28', '2026-11-30'), // arrives tomorrow into a room needing cleaning
    stay(5, null, 'Reserved', '2026-11-29', '2026-12-01'), // no room assigned yet
    stay(6, 3, 'Reserved', '2026-12-10', '2026-12-12'), // outside the 7 days
  ];
  const { days } = buildHousekeepingOverview(rooms, stays, today);
  expect(days).toHaveLength(7);
  expect(days[0].checkouts).toEqual([
    expect.objectContaining({ roomNumber: 'R1', late: false, nextArrivalDate: '2026-11-27' }),
    expect.objectContaining({ roomNumber: 'R2', late: true, nextArrivalDate: null }),
  ]);
  expect(days[0].checkins).toEqual([expect.objectContaining({ roomNumber: 'R1', roomStatus: 'occupied' })]);
  expect(days[1].checkins).toEqual([expect.objectContaining({ roomNumber: 'R3', roomStatus: 'needs' })]);
  expect(days[1].checkouts).toEqual([expect.objectContaining({ roomNumber: 'R1', stayStatus: 'Reserved' })]);
  expect(days[2].checkins).toEqual([expect.objectContaining({ roomId: null, roomNumber: null, roomType: 'Standard' })]);
  expect(days.flatMap(day => [...day.checkins, ...day.checkouts]).some((row: any) => 'guestName' in row || 'occupantName' in row)).toBe(false);
});

test('overview is refused when housekeeping is off', async () => {
  db.property.findUnique.mockResolvedValue({ housekeepingEnabled: false });
  await expect(getHousekeepingOverview(3)).rejects.toMatchObject({ statusCode: 403 });
  expect(db.room.findMany).not.toHaveBeenCalled();
});

test('overview only reads active bookings of the signed-in property', async () => {
  db.property.findUnique.mockResolvedValue({ housekeepingEnabled: true, timezone: 'Africa/Accra', checkInTime: '14:00', checkOutTime: '11:00' });
  db.room.findMany.mockResolvedValue([]);
  db.reservationRoom.findMany.mockResolvedValue([]);
  const result = await getHousekeepingOverview(3, new Date('2026-11-27T10:00:00Z'));
  expect(result).toMatchObject({ date: '2026-11-27', checkInTime: '14:00', checkOutTime: '11:00' });
  expect(db.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { propertyId: 3 } }));
  expect(db.reservationRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reservation: { propertyId: 3, status: { in: ['Confirmed', 'InHouse'] } } }) }));
});

test('reception changing cleaning status is recorded in the activity log', async () => {
  db.room.findUnique.mockResolvedValue({ roomId: 10, propertyId: 3, roomNumber: '102', operationalStatus: 'Available', housekeepingStatus: 'Clean', maintenanceReason: null, roomType: { isActive: true } });
  db.room.update.mockResolvedValue({ roomId: 10, housekeepingStatus: 'Dirty' });
  db.auditLog.create.mockResolvedValue({});
  await updateRoomStatus(10, 'Available', 'Dirty', undefined, { userId: 7, propertyId: 3 });
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 7, propertyId: 3, action: 'HousekeepingStatusChanged', oldData: { roomId: 10, status: 'Clean' }, newData: { roomId: 10, propertyId: 3, status: 'Dirty' } }) });
});

test('no log entry when the cleaning status does not change', async () => {
  db.room.findUnique.mockResolvedValue({ roomId: 10, propertyId: 3, roomNumber: '102', operationalStatus: 'Available', housekeepingStatus: 'Clean', maintenanceReason: null, roomType: { isActive: true } });
  db.room.update.mockResolvedValue({ roomId: 10 });
  await updateRoomStatus(10, 'Available', 'Clean', undefined, { userId: 7, propertyId: 3 });
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
