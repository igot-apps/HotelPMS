import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db: any = {
  $transaction: mock(),
  $queryRaw: mock(),
  reservation: { findMany: mock() },
  reservationRoom: { findUnique: mock() },
  auditLog: { findMany: mock() },
};
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
jest.mock('../src/modules/notifications/simulated-sms.service', () => ({ recordSimulatedSms: jest.fn() }));

import { transitionStay } from '../src/modules/reservation/recovery.service';
import { financialDecision } from '../src/modules/reservation/financial-delegation';
import { getOwedAfterCheckout } from '../src/modules/dashboard/owed-after-checkout.service';

const actor = { userId: 1, propertyId: 3 };
const manager = { userId: 1, isActive: true, role: { roleName: 'Manager' } };
const receptionist = (financialDelegation: any = {}) => ({ userId: 1, isActive: true, role: { roleName: 'Receptionist' }, financialDelegation });
const housekeeper = { userId: 1, isActive: true, role: { roleName: 'Housekeeper' } };

// One room, GHS 400 booked; paid as given. Guest is in the room on the departure day.
function fixture(amountPaid: number, user: any = manager) {
  const stay = { reservationRoomId: 5, reservationId: 'R1', roomId: 9, roomNumberSnapshot: '204', status: 'CheckedIn', checkInDate: new Date('2026-11-09T00:00:00Z'), checkOutDate: new Date('2026-11-13T00:00:00Z'), actualCheckIn: new Date('2026-11-09T15:00:00Z') };
  const res = { reservationId: 'R1', propertyId: 3, status: 'InHouse', totalAmount: 400, amountPaid, reservationRooms: [stay], payments: [] };
  const tx: any = {
    $queryRaw: mock().mockResolvedValue([{ reservationId: 'R1' }]),
    user: { findFirst: mock().mockResolvedValue(user) },
    reservation: { findUniqueOrThrow: mock().mockResolvedValue(res), update: mock() },
    reservationRoom: { update: mock().mockImplementation(async ({ data }: any) => ({ ...stay, ...data })), findFirst: mock().mockResolvedValue(null), findMany: mock().mockResolvedValue([{ ...stay, status: 'CheckedOut' }]) },
    room: { update: mock() },
    property: { findUnique: mock().mockResolvedValue({ timezone: 'Africa/Accra', checkOutTime: '11:00' }) },
    auditLog: { create: mock() },
    payment: { create: mock(), update: mock() },
  };
  db.reservationRoom.findUnique.mockResolvedValue({ reservationId: 'R1' });
  db.$transaction.mockImplementation(async (work: any) => work(tx));
  return { tx };
}
const lastAudit = (tx: any) => tx.auditLog.create.mock.calls.at(-1)[0].data;
// Nothing about the money may change during checkout.
const expectMoneyUntouched = (tx: any) => {
  expect(tx.payment.create).not.toHaveBeenCalled();
  expect(tx.payment.update).not.toHaveBeenCalled();
  expect(tx.reservation.update.mock.calls.some((call: any) => 'totalAmount' in call[0].data || 'amountPaid' in call[0].data)).toBe(false);
};

beforeEach(() => { jest.clearAllMocks(); });

describe('A: fully paid guest', () => {
  test('checks out normally with no reason and a normal audit entry', async () => {
    const { tx } = fixture(400, receptionist());
    await transitionStay(5, 'CheckedOut', actor, {});
    expect(lastAudit(tx).action).toBe('CheckedOut');
    expect(tx.room.update).toHaveBeenCalledWith({ where: { roomId: 9 }, data: { operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null, cleaningStartedAt: null } });
    expectMoneyUntouched(tx);
  });
  test('a reason sent by mistake does not label a paid checkout as money owed', async () => {
    const { tx } = fixture(400);
    await transitionStay(5, 'CheckedOut', actor, { overrideReason: 'Guest promised to pay later.' });
    expect(lastAudit(tx).action).toBe('CheckedOut');
  });
});

describe('B and D: guest still owes money', () => {
  test('checkout without a reason is refused with the amount owed', async () => {
    const { tx } = fixture(150, receptionist());
    await expect(transitionStay(5, 'CheckedOut', actor, {})).rejects.toMatchObject({ code: 'BALANCE_OWING', statusCode: 409, details: { balanceDue: 250 } });
    expect(tx.reservationRoom.update).not.toHaveBeenCalled();
    expect(tx.room.update).not.toHaveBeenCalled();
  });
  test('a blank or too-short reason is refused', async () => {
    fixture(150, receptionist());
    await expect(transitionStay(5, 'CheckedOut', actor, { overrideReason: '   ' })).rejects.toThrow('reason');
    await expect(transitionStay(5, 'CheckedOut', actor, { overrideReason: 'ok' })).rejects.toThrow('reason');
  });
  test('with a reason the guest is checked out, the room needs cleaning and the debt is untouched', async () => {
    const { tx } = fixture(150, receptionist());
    await transitionStay(5, 'CheckedOut', actor, { overrideReason: 'Guest promised to pay later.' });
    expect(tx.reservationRoom.update.mock.calls[0][0].data).toMatchObject({ status: 'CheckedOut' });
    expect(tx.reservationRoom.update.mock.calls[0][0].data.actualCheckOut).toBeInstanceOf(Date);
    expect(tx.room.update).toHaveBeenCalledWith({ where: { roomId: 9 }, data: { operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null, cleaningStartedAt: null } });
    expectMoneyUntouched(tx);
    const audit = lastAudit(tx);
    expect(audit).toMatchObject({ action: 'CreditCheckoutApproved', userId: 1 });
    expect(audit.newData).toMatchObject({ reservationId: 'R1', reason: 'Guest promised to pay later.' });
  });
});

describe('multi-room booking: balance belongs to the booking', () => {
  const addRoom = async (tx: any, status: string) => {
    const res = await tx.reservation.findUniqueOrThrow();
    res.reservationRooms.push({ reservationRoomId: 6, reservationId: 'R1', roomId: 10, roomNumberSnapshot: '205', status, checkInDate: new Date('2026-11-09T00:00:00Z'), checkOutDate: new Date('2026-11-13T00:00:00Z') });
    tx.reservation.findUniqueOrThrow.mockResolvedValue(res);
  };
  test('one room leaves while another room is still checked in: no money-owed reason needed, debt untouched', async () => {
    const { tx } = fixture(150, receptionist());
    await addRoom(tx, 'CheckedIn');
    await transitionStay(5, 'CheckedOut', actor, {});
    const audit = lastAudit(tx);
    expect(audit.action).toBe('CheckedOut');
    expect(audit.newData.value).toMatchObject({ partialCheckout: true, bookingBalance: 250 });
    expect(tx.room.update).toHaveBeenCalledWith({ where: { roomId: 9 }, data: { operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null, cleaningStartedAt: null } });
    expectMoneyUntouched(tx);
  });
  test('the last checked-in room still needs the reason when money is owed', async () => {
    const { tx } = fixture(150, receptionist());
    await addRoom(tx, 'CheckedOut');
    await expect(transitionStay(5, 'CheckedOut', actor, {})).rejects.toMatchObject({ code: 'BALANCE_OWING' });
    await transitionStay(5, 'CheckedOut', actor, { overrideReason: 'Guest promised to pay later.' });
    expect(lastAudit(tx).action).toBe('CreditCheckoutApproved');
  });
  test('a room still only reserved (not arrived) does not count as occupied', async () => {
    const { tx } = fixture(150, receptionist());
    await addRoom(tx, 'Reserved');
    await expect(transitionStay(5, 'CheckedOut', actor, {})).rejects.toMatchObject({ code: 'BALANCE_OWING' });
  });
});

describe('F: permissions (no manager approval, no amount limit)', () => {
  test('staff outside the front desk cannot check out a guest owing money', async () => {
    const { tx } = fixture(150, housekeeper);
    await expect(transitionStay(5, 'CheckedOut', actor, { overrideReason: 'Guest promised to pay later.' })).rejects.toThrow('Front desk staff required');
    expect(tx.reservationRoom.update).not.toHaveBeenCalled();
  });
  test('a receptionist checks out any amount owed directly, even if an old limit is still stored', async () => {
    const { tx } = fixture(0, receptionist({ 'credit-checkout': 100 }));
    await transitionStay(5, 'CheckedOut', actor, { overrideReason: 'Guest promised to pay later.' });
    expect(lastAudit(tx).action).toBe('CreditCheckoutApproved');
    expectMoneyUntouched(tx);
    expect(financialDecision(receptionist({ 'credit-checkout': 100 }), 'credit-checkout', { balance: 5000 }).canApply).toBe(true);
    expect(financialDecision(manager, 'credit-checkout', { balance: 5000 }).canApply).toBe(true);
  });
});

describe('D and E: owed after checkout list', () => {
  const booking = (id: string, total: number, paid: number) => ({
    reservationId: id, confirmationCode: `HO-${id}`, guestNameSnapshot: `Guest ${id}`, guestPhoneSnapshot: null, totalAmount: total, amountPaid: paid,
    platformGuest: null, propertyGuest: null, reservationRooms: [{ roomNumberSnapshot: '204', actualCheckOut: new Date('2026-11-13T10:00:00Z'), room: { roomNumber: '204' } }],
  });
  test('lists checked-out bookings with a balance, with reason and approver', async () => {
    db.$queryRaw.mockResolvedValue([{ reservationId: 'R1' }]);
    db.reservation.findMany.mockResolvedValue([booking('R1', 400, 150)]);
    db.auditLog.findMany.mockResolvedValue([{ newData: { reservationId: 'R1', reason: 'Guest promised to pay later.' }, createdAt: new Date(), user: { fullName: 'Ama Front Desk' } }]);
    const result = await getOwedAfterCheckout(3);
    expect(result.total).toBe(250);
    expect(result.bookings[0]).toMatchObject({ confirmationCode: 'HO-R1', guestName: 'Guest R1', roomNumbers: ['204'], balanceDue: 250, reason: 'Guest promised to pay later.', approvedBy: 'Ama Front Desk' });
    expect(db.reservation.findMany.mock.calls[0][0].where).toMatchObject({ propertyId: 3 });
  });
  test('a booking paid off after checkout drops out of the list', async () => {
    db.$queryRaw.mockResolvedValue([{ reservationId: 'R1' }]);
    db.reservation.findMany.mockResolvedValue([booking('R1', 400, 400)]);
    db.auditLog.findMany.mockResolvedValue([]);
    expect((await getOwedAfterCheckout(3)).bookings).toEqual([]);
  });
  test('no owing bookings means no further lookups', async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect(await getOwedAfterCheckout(3)).toEqual({ total: 0, bookings: [] });
    expect(db.reservation.findMany).not.toHaveBeenCalled();
  });
});
