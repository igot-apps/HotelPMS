import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db: any = {
  property: { findUnique: mock() }, reservationRoom: { findMany: mock() }, room: { findMany: mock() },
  payment: { findMany: mock() }, correctionRequest: { count: mock() },
};
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
import { getDashboardGlance } from '../src/modules/dashboard/glance.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const reservation = (id: string, total: number, paid: number) => ({ reservationId: id, confirmationCode: `C-${id}`, guestNameSnapshot: `Guest ${id}`, totalAmount: total, amountPaid: paid, source: 'WalkIn' });
const stay = (id: number, status: string, checkIn: string, checkOut: string, res: any, extra: any = {}) => ({ reservationRoomId: id, status, checkInDate: day(checkIn), checkOutDate: day(checkOut), room: { roomNumber: String(100 + id) }, occupantName: null, actualCheckIn: null, actualCheckOut: null, reservation: res, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  db.property.findUnique.mockResolvedValue({ timezone: 'Africa/Accra', checkOutTime: '11:00', checkInTime: '14:00', isOnlineBookingEnabled: true });
  db.reservationRoom.findMany.mockResolvedValue([
    stay(1, 'CheckedIn', '2026-11-13', '2026-11-16', reservation('A', 300, 100), { actualCheckIn: new Date('2026-11-13T15:00:00Z') }),
    stay(2, 'CheckedIn', '2026-11-15', '2026-11-18', reservation('B', 300, 300), { actualCheckIn: new Date('2026-11-16T09:00:00Z') }),
    stay(3, 'Reserved', '2026-11-16', '2026-11-17', reservation('C', 150, 0)),
    stay(4, 'CheckedOut', '2026-11-14', '2026-11-16', reservation('D', 200, 200), { actualCheckOut: new Date('2026-11-16T10:00:00Z') }),
    stay(5, 'Reserved', '2026-11-15', '2026-11-18', reservation('E', 450, 150)),
  ]);
  db.room.findMany.mockResolvedValue([
    { roomId: 1, roomNumber: '101', operationalStatus: 'Occupied', housekeepingStatus: 'Clean', isOnlineBookable: true, roomType: { typeName: 'Standard' }, reservationRooms: [{ reservationRoomId: 1 }] },
    { roomId: 2, roomNumber: '102', operationalStatus: 'Occupied', housekeepingStatus: 'Clean', isOnlineBookable: true, roomType: { typeName: 'Standard' }, reservationRooms: [{ reservationRoomId: 2 }] },
    { roomId: 3, roomNumber: '103', operationalStatus: 'Available', housekeepingStatus: 'Dirty', isOnlineBookable: true, roomType: { typeName: 'Deluxe' }, reservationRooms: [] },
    { roomId: 4, roomNumber: '104', operationalStatus: 'Maintenance', housekeepingStatus: 'Clean', maintenanceReason: 'Plumbing repair', isOnlineBookable: true, roomType: { typeName: 'Deluxe' }, reservationRooms: [] },
  ]);
  db.payment.findMany.mockResolvedValue([{ paymentId: 9, amount: 120, paymentMethod: 'Cash', paymentDate: new Date('2026-11-16T09:30:00Z'), gatewayReference: null, receiver: { fullName: 'Ama' }, reservation: { reservationId: 'B', confirmationCode: 'C-B', guestNameSnapshot: 'Guest B' } }]);
  db.correctionRequest.count.mockResolvedValue(2);
});

test('answers the front desk questions for today with the rows behind them', async () => {
  const glance = await getDashboardGlance(3, 'Manager', new Date('2026-11-16T12:00:00Z'));
  expect(glance.inHouse).toHaveLength(2);
  expect(glance.departures.waiting.map((s: any) => s.reservationRoomId)).toEqual([1]);
  expect(glance.departures.waiting[0]).toMatchObject({ minutesLate: 60, balanceDue: 200, nightsUsed: 3 });
  expect(glance.departures.departedToday).toHaveLength(1);
  expect(glance.arrivals).toMatchObject({ unpaidCount: 1 });
  expect(glance.arrivals.waiting.map((s: any) => s.reservationRoomId)).toEqual([3]);
  expect(glance.arrivals.missed).toHaveLength(1);
  expect(glance.arrivals.missed[0]).toMatchObject({ reservationId: 'E', daysMissed: 1, nightsLeft: 2, amountPaid: 150 });
  expect(glance.arrivals.arrivedToday.map((s: any) => s.reservationRoomId)).toEqual([2]);
  expect(glance.rooms).toMatchObject({ total: 3, occupiedTonight: 2, occupancyPercent: 67 });
  expect(glance.rooms.freeTonight.map((r: any) => r.roomNumber)).toEqual(['103']);
  expect(glance.rooms.maintenance[0]).toMatchObject({ roomNumber: '104', maintenanceReason: 'Plumbing repair' });
  expect(glance.money).toMatchObject({ collectedToday: 120, inHouseOutstanding: 200, refundsPending: 2 });
  expect(glance.approvalsPending).toBe(2);
});

test('receptionists do not see the manager approval count', async () => {
  const glance = await getDashboardGlance(3, 'Receptionist', new Date('2026-11-16T12:00:00Z'));
  expect(glance.approvalsPending).toBe(0);
});

test('a same-day arrival only counts as missed after check-in time plus grace', async () => {
  const evening = await getDashboardGlance(3, 'Manager', new Date('2026-11-16T20:30:00Z'));
  expect(evening.arrivals.missed.map((s: any) => s.reservationId).sort()).toEqual(['C', 'E']);
  expect(evening.arrivals.waiting).toHaveLength(0);
});

test('reports fully booked tonight and why guests cannot book online', async () => {
  db.property.findUnique.mockResolvedValue({ timezone: 'Africa/Accra', checkOutTime: '11:00', checkInTime: '14:00', isOnlineBookingEnabled: true });
  db.room.findMany.mockResolvedValue([
    { roomId: 1, roomNumber: '101', operationalStatus: 'Occupied', housekeepingStatus: 'Clean', isOnlineBookable: false, roomType: { typeName: 'Standard' }, reservationRooms: [{ reservationRoomId: 1 }] },
  ]);
  const full = await getDashboardGlance(3, 'Manager', new Date('2026-11-16T12:00:00Z'));
  expect(full.rooms.fullyBookedTonight).toBe(true);
  expect(full.onlineBlocker).toBe('all-hidden');
  db.room.findMany.mockResolvedValue([]);
  expect((await getDashboardGlance(3, 'Manager', new Date('2026-11-16T12:00:00Z'))).onlineBlocker).toBe('no-rooms');
  db.property.findUnique.mockResolvedValue({ timezone: 'Africa/Accra', checkOutTime: '11:00', checkInTime: '14:00', isOnlineBookingEnabled: false });
  expect((await getDashboardGlance(3, 'Manager', new Date('2026-11-16T12:00:00Z'))).onlineBlocker).toBe('online-off');
});
