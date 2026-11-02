import { jest, beforeEach, afterEach, test, expect } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { getOperationalOverview } from '../src/modules/dashboard/dashboard.repository';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
const db = prisma as any;
let tx: any;
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-02T01:00:00Z'));
  tx = {
    property: { findUnique: jest.fn<any>().mockResolvedValue({ timezone: 'Africa/Accra' }) },
    room: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reservationRoom: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
  db.$transaction.mockImplementation((work: any) => work(tx));
});
afterEach(() => { jest.useRealTimers(); });

test('counts dirty and maintenance independently instead of marking all unready rooms occupied', async () => {
  const room = (roomId: number, extra = {}) => ({ roomId, roomNumber: String(roomId), operationalStatus: 'Available', housekeepingStatus: 'Clean', roomType: { isActive: true }, reservationRooms: [], ...extra });
  tx.room.findMany.mockResolvedValue([
    room(1), room(2, { housekeepingStatus: 'Inspected' }), room(3, { housekeepingStatus: 'Dirty' }),
    room(4, { operationalStatus: 'Maintenance' }), room(5, { operationalStatus: 'Occupied' }),
    room(6, { roomType: { isActive: false } }), room(7, { reservationRooms: [{ reservationRoomId: 20 }] }),
  ]);
  const result = await getOperationalOverview(4);
  expect(result.roomStats).toEqual({ Total: 7, Available: 2, Occupied: 2, Dirty: 1, Maintenance: 1 });
  expect(result.alerts.map(r => r.roomId)).toEqual([3, 4]);
});
test('groups only pending room tasks, prioritizes overdue stays, and retains booking balances', async () => {
  const stay = (id: number, bookingId: string, status: string, date: string) => ({
    reservationRoomId: id, reservationId: bookingId, status, checkInDate: new Date(`${date}T00:00Z`), checkOutDate: new Date(`${date}T00:00Z`), roomNumberSnapshot: String(id),
    reservation: { reservationId: bookingId, totalAmount: 400, amountPaid: 100, guestNameSnapshot: 'Snapshot guest' },
  });
  tx.reservationRoom.findMany.mockResolvedValue([
    stay(1, 'today', 'Reserved', '2026-11-02'), stay(2, 'late', 'Reserved', '2026-11-01'),
    stay(3, 'today', 'Reserved', '2026-11-02'), stay(4, 'departure', 'CheckedIn', '2026-11-01'),
  ]);
  const result = await getOperationalOverview(4);
  expect(result.taskCounts).toEqual({ arrivals: 3, departures: 1, overdueArrivals: 1, overdueDepartures: 1 });
  expect(result.arrivals.map(r => r.reservationId)).toEqual(['late', 'today']);
  expect(result.arrivals[1].reservationRooms).toHaveLength(2);
  expect(result.departures[0].balanceDue).toBe(300);
  expect(result.arrivals[0].guest.fullName).toBe('Snapshot guest');
  const where = tx.reservationRoom.findMany.mock.calls[0][0].where;
  expect(where.reservation).toEqual({ propertyId: 4, status: { in: ['Confirmed', 'InHouse'] } });
  expect(where.OR[0].status).toBe('Reserved'); expect(where.OR[1].status).toBe('CheckedIn');
  expect(tx.room.findMany.mock.calls[0][0].where).toEqual({ propertyId: 4 });
});
test('uses hotel calendar day rather than server timezone at midnight', async () => {
  tx.property.findUnique.mockResolvedValue({ timezone: 'America/New_York' });
  const result = await getOperationalOverview(4);
  expect(result.date).toBe('2026-11-01');
  expect(tx.reservationRoom.findMany.mock.calls[0][0].where.OR[0].checkInDate.lt.toISOString()).toBe('2026-11-02T00:00:00.000Z');
});
test('returns zero counts for an empty hotel and rejects unknown hotels', async () => {
  const result = await getOperationalOverview(4);
  expect(result.totalRooms).toBe(0); expect(result.arrivals).toEqual([]); expect(result.departures).toEqual([]);
  tx.property.findUnique.mockResolvedValue(null);
  await expect(getOperationalOverview(4)).rejects.toThrow('Hotel not found');
});
