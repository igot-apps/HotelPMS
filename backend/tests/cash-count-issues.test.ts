import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const tx: any = {
  user: { findFirst: mock() }, cashCount: { findFirst: mock() },
  cashCountIssue: { create: mock() }, auditLog: { create: mock() },
};
const db: any = { $transaction: (callback: (transaction: any) => Promise<any>) => callback(tx) };
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
import { recordCashCountIssue } from '../src/modules/reports/cash-reconciliation.service';

beforeEach(() => {
  jest.clearAllMocks();
  tx.user.findFirst.mockImplementation(({ where }: any) => where.userId === 1
    ? { userId: 1, fullName: 'Ama', role: { roleName: 'Receptionist' }, property: { timezone: 'Africa/Accra' } }
    : { userId: where.userId, fullName: 'Kofi' });
  tx.cashCount.findFirst.mockResolvedValue(null);
  tx.cashCountIssue.create.mockResolvedValue({ cashCountIssueId: 7 });
  tx.auditLog.create.mockResolvedValue({});
});

test('records an explanation without inventing a cash amount', async () => {
  const result = await recordCashCountIssue({ userId: 1, propertyId: 3 }, { date: '2026-11-22', reason: 'Cash drawer key unavailable' });
  expect(result.reason).toBe('Cash drawer key unavailable');
  expect(tx.cashCountIssue.create).toHaveBeenCalledWith({ data: expect.objectContaining({ staffUserId: 1, reason: 'Cash drawer key unavailable' }) });
  expect(tx.auditLog.create).toHaveBeenCalled();
});

test('requires a reason and prevents receptionists reporting for another staff member', async () => {
  await expect(recordCashCountIssue({ userId: 1, propertyId: 3 }, { reason: '  ' })).rejects.toThrow('Enter a reason');
  await expect(recordCashCountIssue({ userId: 1, propertyId: 3 }, { staffUserId: 2, reason: 'Unable to count' })).rejects.toThrow('your own cash count');
  expect(tx.cashCountIssue.create).not.toHaveBeenCalled();
});

test('does not mark an already counted day as pending', async () => {
  tx.cashCount.findFirst.mockResolvedValue({ cashCountId: 4 });
  await expect(recordCashCountIssue({ userId: 1, propertyId: 3 }, { reason: 'Unable to count' })).rejects.toThrow('already counted');
});

test('allows a manager to add a follow-up for a receptionist', async () => {
  tx.user.findFirst.mockImplementation(({ where }: any) => where.userId === 9
    ? { userId: 9, fullName: 'Manager', role: { roleName: 'Manager' }, property: { timezone: 'Africa/Accra' } }
    : { userId: 2, fullName: 'Kofi' });
  await recordCashCountIssue({ userId: 9, propertyId: 3 }, { date: '2026-11-22', staffUserId: 2, reason: 'Drawer will be counted tomorrow' });
  expect(tx.cashCountIssue.create).toHaveBeenCalledWith({ data: expect.objectContaining({ staffUserId: 2, recordedBy: 9 }) });
});
