import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db: any = {
  payment: { aggregate: mock(), groupBy: mock() }, room: { count: mock() },
  reservationRoom: { findMany: mock() }, refund: { aggregate: mock() },
};
jest.mock('../src/generated/prisma', () => ({ PrismaClient: function PrismaClient() { return db; } }));
import { getCategoryBreakdowns, getFinancialSummary } from '../src/modules/reports/report.repository';

// 30 Nov – 4 Dec in Accra (UTC): start of the first day to the last millisecond of the last one.
const start = new Date('2026-11-30T00:00:00.000Z');
const end = new Date('2026-12-05T00:00:00.000Z').getTime() - 1;

beforeEach(() => {
  jest.clearAllMocks();
  db.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: 0 });
  db.refund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.payment.groupBy.mockResolvedValue([]);
  db.room.count.mockResolvedValue(8);
  db.reservationRoom.findMany.mockResolvedValue([
    { checkInDate: new Date('2026-11-30T00:00:00Z'), checkOutDate: new Date('2026-12-02T00:00:00Z'), agreedPricePerNight: 300, roomTypeNameSnapshot: 'Standard', roomType: null },
  ]);
});

test('a 5-day period counts 5 days of rooms, not 6', async () => {
  const summary = await getFinancialSummary(1, start, new Date(end));
  expect(summary.totalAvailableNights).toBe(40);
  expect(summary.actualOccupiedNights).toBe(2);
  expect(summary.occupancyRate).toBe(5);
});

test('a single-day period counts one day', async () => {
  const summary = await getFinancialSummary(1, start, new Date(new Date('2026-12-01T00:00:00Z').getTime() - 1));
  expect(summary.totalAvailableNights).toBe(8);
});

test('revenue by room type leaves out expired rooms, like the summary', async () => {
  await getCategoryBreakdowns(1, start, new Date(end));
  await getFinancialSummary(1, start, new Date(end));
  const [byType, summary] = db.reservationRoom.findMany.mock.calls.map((call: any) => call[0].where);
  expect(byType.status).toEqual({ not: 'NoShow' });
  expect(summary.status).toEqual({ not: 'NoShow' });
  expect(byType.reservation.status).toEqual({ notIn: ['Cancelled'] });
});
