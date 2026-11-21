import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db: any = { user: { findFirst: mock(), findMany: mock() }, auditLog: { findMany: mock() }, reservation: { findMany: mock() }, payment: { findMany: mock() } };
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
import { getActivityLog } from '../src/modules/reports/activity-log.service';

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findFirst.mockResolvedValue({ userId: 1, role: { roleName: 'Manager' }, property: { timezone: 'Africa/Accra' } });
  db.user.findMany.mockResolvedValue([{ userId: 1, fullName: 'Ama', isActive: true, role: { roleName: 'Manager' } }, { userId: 2, fullName: 'Kofi', isActive: true, role: { roleName: 'Receptionist' } }]);
  db.auditLog.findMany.mockResolvedValue([
    { auditLogId: 10, userId: 2, action: 'DepartureVerified', createdAt: new Date('2026-11-20T10:00:00Z'), newData: { result: 'departed', note: 'Keys returned', reservationId: 'R1' } },
    { auditLogId: 11, userId: 2, action: 'Correction:undo-checkout', createdAt: new Date('2026-11-20T12:00:00Z'), newData: { value: { result: { reason: 'Wrong room' }, reservation: { reservationId: 'R1' } } } },
  ]);
  db.reservation.findMany.mockImplementation(async (args: any) => args.where.staffId
    ? [{ reservationId: 'R1', staffId: 2, createdAt: new Date('2026-11-20T09:00:00Z'), source: 'Walk-in', totalAmount: 300 }]
    : [{ reservationId: 'R1', confirmationCode: 'RES-1', guestNameSnapshot: 'Guest One' }]);
  db.payment.findMany.mockResolvedValue([{ paymentId: 5, reservationId: 'R1', receivedBy: 2, paymentDate: new Date('2026-11-20T09:30:00Z'), amount: 300, paymentMethod: 'Cash', status: 'Completed' }]);
});

test('lists every staff action newest first, with who, what and the booking', async () => {
  const log = await getActivityLog(1, 4, { from: '2026-11-20', to: '2026-11-20' });
  expect(log.items.map((i: any) => i.label)).toEqual(['Correction: undo checkout', 'Departure verified', 'Payment received', 'Booking created']);
  expect(log.items[0]).toMatchObject({ staffName: 'Kofi', detail: 'Reason: Wrong room', confirmationCode: 'RES-1', kind: 'corrections' });
  expect(log.items[1].detail).toBe('Guest has left · Note: Keys returned');
  // Only this hotel's staff are searched.
  expect(db.auditLog.findMany.mock.calls[0][0].where.userId).toEqual({ in: [1, 2] });
});

test('filters by type and staff member', async () => {
  const log = await getActivityLog(1, 4, { from: '2026-11-20', to: '2026-11-20', kind: 'money', staffId: '2' });
  expect(log.items.map((i: any) => i.label)).toEqual(['Payment received']);
  expect(db.auditLog.findMany.mock.calls[0][0].where.userId).toEqual({ in: [2] });
});

test('only the manager can see it', async () => {
  db.user.findFirst.mockResolvedValue({ userId: 2, role: { roleName: 'Receptionist' }, property: {} });
  await expect(getActivityLog(2, 4, {})).rejects.toMatchObject({ statusCode: 403 });
});
