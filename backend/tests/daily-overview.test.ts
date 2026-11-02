import { prisma } from '../src/shared/utils/prisma';
import { jest, test, expect, beforeEach } from '@jest/globals';
import { dailyOverview, dayBounds, hotelDate } from '../src/modules/reports/daily-overview.service';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { user: { findFirst: jest.fn() }, $transaction: jest.fn() } }));

const mock = prisma as any;
let tx: any;
beforeEach(() => {
  jest.resetAllMocks();
  mock.user.findFirst.mockResolvedValue({ role: { roleName: 'Manager' }, property: { timezone: 'Africa/Accra' } });
  tx = { payment: { findMany: jest.fn<any>().mockResolvedValue([]) }, auditLog: { findMany: jest.fn<any>().mockResolvedValue([]) }, reservation: { count: jest.fn<any>().mockResolvedValue(0), findMany: jest.fn<any>().mockResolvedValue([]) }, reservationRoom: { count: jest.fn<any>().mockResolvedValue(0) } };
  mock.$transaction.mockImplementation((work: any) => work(tx));
});

test('uses hotel-local date and exclusive boundaries including DST', () => {
  expect(hotelDate(new Date('2026-11-02T01:00Z'), 'America/New_York')).toBe('2026-11-01');
  const bounds = dayBounds('2026-11-01', 'America/New_York');
  expect(bounds.gte.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  expect(bounds.lt.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  expect(() => dayBounds('2026-02-30', 'Africa/Accra')).toThrow('valid report date');
});
test('rejects receptionists and missing accounts before reading financial data', async () => {
  mock.user.findFirst.mockResolvedValue({ role: { roleName: 'Receptionist' }, property: {} });
  await expect(dailyOverview(2, 4)).rejects.toMatchObject({ statusCode: 403 });
  mock.user.findFirst.mockResolvedValue(null);
  await expect(dailyOverview(2, 4)).rejects.toMatchObject({ statusCode: 403 });
  expect(mock.$transaction).not.toHaveBeenCalled();
});
test('separates staff, online, unknown, voids and replacement entries without double counting', async () => {
  const payment = (id: number, amount: number, extra = {}) => ({ paymentId: id, reservationId: 'booking', reservation: { confirmationCode: 'ABC', guestNameSnapshot: 'Guest' }, receivedBy: 2, receiver: { fullName: 'Ama' }, paymentMethod: 'Cash', status: 'Completed', paymentDate: new Date(), amount, ...extra });
  tx.payment.findMany.mockResolvedValue([
    payment(1, 20.10), payment(2, 30.20), payment(3, 100, { status: 'Voided' }),
    payment(4, 80, { notes: 'Correction of payment #3: wrong amount' }),
    payment(5, 50, { gatewayReference: 'RES-123', receiver: null, receivedBy: null, paymentMethod: 'Card' }),
    payment(6, 5, { receiver: null, receivedBy: null }), payment(7, 9, { status: 'Refunded' }),
  ]);
  tx.reservation.findMany.mockResolvedValue([{ totalAmount: 100, amountPaid: 40 }, { totalAmount: 50, amountPaid: 70 }]);
  const result = await dailyOverview(1, 4, '2026-11-02');
  expect(result.collections).toBe(105.30); expect(result.transactions).toBe(4);
  expect(result.correctionEntries).toBe(80); expect(result.payments).toHaveLength(7);
  expect(result.byStaff.find(row => row.name === 'Ama')).toMatchObject({ total: 50.30, count: 2 });
  expect(result.byStaff.some(row => row.name === 'Online / Paystack')).toBe(true);
  expect(result.activity.outstandingNow).toBe(60);
  expect(tx.payment.findMany.mock.calls[0][0].where.reservation).toEqual({ propertyId: 4 });
  expect(mock.user.findFirst.mock.calls[0][0].where).toEqual({ userId: 1, propertyId: 4, isActive: true });
  expect(tx.reservationRoom.count.mock.calls[0][0].where.reservation).toEqual({ propertyId: 4 });
});
test('returns explicit empty results when nothing happened', async () => {
  const result = await dailyOverview(1, 4, '2026-11-02');
  expect(result.collections).toBe(0); expect(result.byStaff).toEqual([]); expect(result.events).toEqual([]);
});
