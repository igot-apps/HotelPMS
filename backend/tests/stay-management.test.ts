import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db: any = {
  $transaction: mock(),
  property: { findUnique: mock() },
  user: { findFirst: mock() },
  reservationRoom: { findMany: mock(), findFirst: mock(), findUnique: mock(), update: mock() },
  auditLog: { findMany: mock(), create: mock(), count: mock() },
};
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
jest.mock('../src/modules/notifications/simulated-sms.service', () => ({ recordSimulatedSms: jest.fn() }));

import { correctBookingInTransaction, transitionStay } from '../src/modules/reservation/recovery.service';
import { checkoutDueAt, checkoutState, hotelWallTime, overdueOccupancyClause } from '../src/modules/reservation/stay-timing';
import { checkoutAlerts, verifyDeparture } from '../src/modules/reservation/checkout-alerts.service';

const actor = { userId: 1, propertyId: 3 };
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const manager = { userId: 1, isActive: true, role: { roleName: 'Manager' } };
const receptionist = { userId: 1, isActive: true, role: { roleName: 'Receptionist' }, financialDelegation: {} };

// Booked Monday 9 → Friday 13 November (4 nights at GHS 100), checked in Monday 23:00, fully paid.
function fixture(overrides: any = {}) {
  const stay = { reservationRoomId: 5, reservationId: 'R1', roomId: 9, roomNumberSnapshot: '204', status: 'CheckedIn', checkInDate: day('2026-11-09'), checkOutDate: day('2026-11-13'), originalCheckOutDate: null, agreedPricePerNight: 100, actualCheckIn: new Date('2026-11-09T23:00:00Z'), guestOutAt: null, guestReturnedAt: null, updatedAt: new Date('2026-11-09T23:00:00Z'), ...overrides.stay };
  const res = { reservationId: 'R1', propertyId: 3, status: 'InHouse', totalAmount: 400, amountPaid: 400, refundDue: 0, updatedAt: new Date('2026-11-09T23:00:00Z'), reservationRooms: [stay], payments: [], ...overrides.res };
  const tx: any = {
    $queryRaw: mock().mockResolvedValue([{ reservationId: 'R1' }]),
    user: { findFirst: mock().mockResolvedValue(overrides.user || manager) },
    reservation: { findUniqueOrThrow: mock().mockResolvedValue(res), findUnique: mock().mockResolvedValue(res), update: mock() },
    reservationRoom: { update: mock(), findFirst: mock().mockResolvedValue(null), findMany: mock().mockResolvedValue([{ ...stay, status: 'CheckedOut' }]) },
    room: { findUnique: mock().mockResolvedValue({ roomNumber: '204' }), update: mock() },
    property: { findUnique: mock().mockResolvedValue({ timezone: 'Africa/Accra', checkOutTime: '11:00' }) },
    auditLog: { findMany: mock().mockResolvedValue(overrides.checks || []), count: mock().mockResolvedValue(overrides.housekeeping || 0), create: mock() },
    payment: { count: mock().mockResolvedValue(overrides.payments || 0) },
  };
  return { stay, res, tx };
}
const departure = (departedAt: string, extra: any = {}) => ({ action: 'record-departure', stayIds: [5], departedAt, evidenceType: 'key-returned', evidenceNote: 'Key card handed back at reception by the guest.', reason: 'Checkout was not recorded when the guest left.', ...extra });

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

describe('forgotten checkout (record actual departure)', () => {
  test('ends the stay on the departure day, keeps consumed nights and turns the rest into a refund', async () => {
    const { tx } = fixture();
    const preview = await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), preview: true });
    expect(preview).toMatchObject({ newCheckOutDate: '2026-11-10', nightsCharged: 1, oldTotal: 400, newTotal: 100, credit: 300, contradictions: [] });

    await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), expectedVersion: preview.version });
    expect(tx.reservationRoom.update).toHaveBeenCalledWith({ where: { reservationRoomId: 5 }, data: expect.objectContaining({
      status: 'CheckedOut', actualCheckOut: new Date('2026-11-10T10:00:00Z'), checkOutDate: day('2026-11-10'), originalCheckOutDate: day('2026-11-13'),
    }) });
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId: 'R1' }, data: expect.objectContaining({ totalAmount: 100, refundDue: 300, refundStatus: 'Pending' }) });
    expect(tx.room.update).toHaveBeenCalledWith({ where: { roomId: 9 }, data: { operationalStatus: 'Available', housekeepingStatus: 'Dirty' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'Correction:record-departure' }) });
  });

  test('crossing midnight does not consume another night (Monday 23:00 in, Tuesday 02:00 out = 1 night)', async () => {
    const { tx } = fixture();
    const preview = await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T02:00:00Z'), preview: true });
    expect(preview).toMatchObject({ newCheckOutDate: '2026-11-10', nightsCharged: 1 });
  });

  test('the first night stays consumed even if the guest left the same evening', async () => {
    const { tx } = fixture();
    const preview = await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-09T23:30:00Z'), preview: true });
    expect(preview).toMatchObject({ newCheckOutDate: '2026-11-10', nightsCharged: 1 });
  });

  test('a late recorded departure never adds nights or charges', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-16T09:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { tx } = fixture();
    const preview = await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-14T15:00:00Z'), preview: true });
    expect(preview).toMatchObject({ newCheckOutDate: '2026-11-13', nightsCharged: 4, newTotal: 400, credit: 0 });
    await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-14T15:00:00Z'), expectedVersion: preview.version });
    expect(tx.reservation.update.mock.calls.some((call: any) => 'totalAmount' in call[0].data)).toBe(false);
  });

  test('only records placing the guest in the room afterwards are contradictions', async () => {
    const { tx } = fixture({ stay: { guestReturnedAt: new Date('2026-11-11T18:00:00Z') }, housekeeping: 2, payments: 1 });
    const preview = await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), preview: true });
    expect(preview.contradictions).toHaveLength(1);
    expect(preview.information.join(' ')).toMatch(/not proof/);
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), expectedVersion: preview.version })).rejects.toThrow('Explain why');
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z', { contradictionNote: 'Guest came back only to collect luggage.' }), expectedVersion: preview.version })).resolves.toMatchObject({ applied: true });
  });

  test('housekeeping or payments after the claimed departure alone do not block it', async () => {
    const { tx } = fixture({ housekeeping: 3, payments: 2 });
    const preview = await correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), preview: true });
    expect(preview.contradictions).toEqual([]);
  });

  test('a receptionist can preview for a request but cannot apply it', async () => {
    const { tx } = fixture({ user: receptionist });
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), preview: true }, true)).resolves.toMatchObject({ nightsCharged: 1 });
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z'), expectedVersion: 'x' })).rejects.toThrow('Manager approval');
  });

  test('evidence and a valid time are required', async () => {
    const { tx } = fixture();
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z', { evidenceType: '' }), preview: true })).rejects.toThrow('evidence');
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-10T10:00:00Z', { evidenceNote: 'short' }), preview: true })).rejects.toThrow('Explain the evidence');
    await expect(correctBookingInTransaction(tx, 'R1', actor, { ...departure('2026-11-09T20:00:00Z'), preview: true })).rejects.toThrow('before the guest checked in');
  });
});

describe('normal and late checkout', () => {
  test('records how late the guest left and the note, without changing charges', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-13T13:15:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { stay, tx } = fixture();
    db.reservationRoom.findUnique.mockResolvedValue({ reservationId: 'R1' });
    db.$transaction.mockImplementation(async (work: any) => work(tx));
    tx.reservationRoom.update.mockImplementation(async ({ data }: any) => ({ ...stay, ...data }));
    await transitionStay(5, 'CheckedOut', actor, { departureNote: 'Waited for a taxi' });
    const audit = tx.auditLog.create.mock.calls.at(-1)[0].data;
    expect(audit.newData.value).toMatchObject({ lateMinutes: 135, departureNote: 'Waited for a taxi', status: 'CheckedOut' });
    expect(tx.reservation.update.mock.calls.some((call: any) => 'totalAmount' in call[0].data)).toBe(false);
  });
});

describe('stay timing and availability', () => {
  test('uses the hotel checkout time in the hotel time zone', () => {
    expect(hotelWallTime('2026-11-13', '11:00', 'Africa/Accra').toISOString()).toBe('2026-11-13T11:00:00.000Z');
    expect(checkoutDueAt(day('2026-11-13'), '12:30', 'Africa/Lagos').toISOString()).toBe('2026-11-13T11:30:00.000Z');
  });

  test('reminder states: upcoming, due, due soon, overdue', () => {
    const due = new Date('2026-11-13T11:00:00Z');
    expect(checkoutState(due, new Date('2026-11-11T11:00:00Z'))).toBe('upcoming');
    expect(checkoutState(due, new Date('2026-11-13T07:00:00Z'))).toBe('due');
    expect(checkoutState(due, new Date('2026-11-13T10:30:00Z'))).toBe('dueSoon');
    expect(checkoutState(due, new Date('2026-11-13T11:01:00Z'))).toBe('overdue');
  });

  test('an overdue checked-in guest blocks stays starting today but not future reservations', () => {
    const now = new Date('2026-11-16T09:00:00Z');
    expect(overdueOccupancyClause(day('2026-11-16'), 'Africa/Accra', now)).toMatchObject({ status: 'CheckedIn', checkOutDate: { lte: day('2026-11-16') } });
    expect(overdueOccupancyClause(day('2026-11-17'), 'Africa/Accra', now)).toBeNull();
  });
});

describe('checkout reminders and verification', () => {
  const staffUser = (roleName: string) => ({ userId: 1, isActive: true, role: { roleName } });
  const alertStay = (id: number, checkOutDate: string) => ({ reservationRoomId: id, roomNumberSnapshot: null, room: { roomNumber: String(200 + id) }, occupantName: 'Ama', checkOutDate: day(checkOutDate), guestPresenceStatus: 'InRoom', reservation: { reservationId: `R${id}`, confirmationCode: `C${id}`, totalAmount: 100, amountPaid: 100 } });

  test('lists due, due-soon and overdue rooms and escalates unresolved cases to managers', async () => {
    db.user.findFirst.mockResolvedValue(staffUser('Manager'));
    db.property.findUnique.mockResolvedValue({ timezone: 'Africa/Accra', checkOutTime: '11:00' });
    db.reservationRoom.findMany.mockResolvedValue([alertStay(1, '2026-11-15'), alertStay(2, '2026-11-16'), alertStay(3, '2026-11-17'), alertStay(4, '2026-11-16')]);
    db.auditLog.findMany.mockResolvedValue([{ newData: { reservationRoomId: 4, result: 'unlocated', note: 'No answer' }, createdAt: new Date('2026-11-16T10:58:00Z'), user: { fullName: 'Kofi' } }]);
    const result = await checkoutAlerts(actor, new Date('2026-11-16T11:30:00Z'));
    const byId = Object.fromEntries(result.alerts.map((a: any) => [a.reservationRoomId, a]));
    expect(byId[1]).toMatchObject({ state: 'overdue', escalated: true });
    expect(byId[2]).toMatchObject({ state: 'overdue', minutesLate: 30, escalated: false });
    expect(byId[3]).toMatchObject({ state: 'due' });
    expect(byId[4]).toMatchObject({ state: 'overdue', escalated: true, verification: { result: 'unlocated' } });
    expect(result.counts).toMatchObject({ overdue: 3, due: 1, escalated: 2 });
  });

  test('verification records presence and keeps an audit entry', async () => {
    db.user.findFirst.mockResolvedValue(staffUser('Receptionist'));
    const tx = { reservationRoom: { findFirst: mock().mockResolvedValue({ reservationRoomId: 5, reservationId: 'R1', status: 'CheckedIn', guestOutAt: null }), update: mock() }, auditLog: { create: mock() } };
    db.$transaction.mockImplementation(async (work: any) => work(tx));
    await verifyDeparture(actor, 5, { result: 'departed', note: 'Room empty' });
    expect(tx.reservationRoom.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ guestPresenceStatus: 'Out' }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DepartureVerified', newData: expect.objectContaining({ reservationRoomId: 5, result: 'departed' }) }) });
  });

  test('"cannot be found" needs a note, and housekeepers cannot verify', async () => {
    db.user.findFirst.mockResolvedValue(staffUser('Receptionist'));
    await expect(verifyDeparture(actor, 5, { result: 'unlocated' })).rejects.toThrow('Describe what was checked');
    await expect(verifyDeparture(actor, 5, { result: 'maybe' })).rejects.toThrow();
    db.user.findFirst.mockResolvedValue(staffUser('Housekeeper'));
    await expect(verifyDeparture(actor, 5, { result: 'present' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
