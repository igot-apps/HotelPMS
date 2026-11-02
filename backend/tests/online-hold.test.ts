import { jest, test, expect, beforeEach } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { expireOnlineHolds, isExpiredOnlineHold } from '../src/modules/reservation/online-hold.service';
jest.mock('../src/shared/utils/prisma', () => ({ prisma: { reservation: { findMany: jest.fn() }, $transaction: jest.fn() } }));
const db = prisma as any;
const now = new Date('2026-11-02T12:00:00Z');
const hold = { reservationId: 'hold', status: 'Pending', source: 'Website', staffId: null, platformGuestId: 1, amountPaid: 0, createdAt: new Date('2026-11-02T11:50:00Z') };
let tx: any;
beforeEach(() => {
  jest.resetAllMocks();
  db.reservation.findMany.mockResolvedValue([{ reservationId: 'hold' }]);
  tx = { $queryRaw: jest.fn<any>(), reservation: { findFirst: jest.fn<any>().mockResolvedValue(hold), update: jest.fn<any>() }, reservationRoom: { updateMany: jest.fn<any>() }, auditLog: { create: jest.fn<any>() } };
  db.$transaction.mockImplementation((work: any) => work(tx));
});
test('expires at 10 minutes but never expires paid, staff-created or in-house bookings', () => {
  expect(isExpiredOnlineHold(hold, now)).toBe(true);
  expect(isExpiredOnlineHold(hold, new Date(now.getTime() - 1))).toBe(false);
  for (const extra of [{ amountPaid: 1 }, { staffId: 2 }, { source: 'WalkIn' }, { platformGuestId: null }, { status: 'InHouse' }]) {
    expect(isExpiredOnlineHold({ ...hold, ...extra }, now)).toBe(false);
  }
});
test('releases allocations atomically and records history, without changing physical rooms', async () => {
  expect(await expireOnlineHolds(5)).toBe(1);
  const where = db.reservation.findMany.mock.calls[0][0].where;
  expect(where.propertyId).toBe(5); expect(where.amountPaid).toBe(0);
  expect(where.payments.none).toEqual({ status: 'Completed', amount: { gt: 0 } });
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.reservationRoom.updateMany).toHaveBeenCalledWith({ where: { reservationId: 'hold', status: 'Reserved' }, data: { status: 'Cancelled' } });
  expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId: 'hold' }, data: { status: 'Expired' } });
  expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('OnlinePaymentHoldExpired');
});
test('rechecks after locking so a payment or another expiry wins safely', async () => {
  tx.reservation.findFirst.mockResolvedValue(null);
  expect(await expireOnlineHolds()).toBe(0);
  expect(tx.reservation.update).not.toHaveBeenCalled(); expect(tx.auditLog.create).not.toHaveBeenCalled();
});
