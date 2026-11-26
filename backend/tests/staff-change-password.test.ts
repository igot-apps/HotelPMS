import { beforeEach, expect, jest, test } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { comparePassword } from '../src/shared/utils/password';
import { changeStaffPassword } from '../src/modules/auth/password-reset.service';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), update: jest.fn((a: any) => a) }, auditLog: { create: jest.fn((a: any) => a) }, $transaction: jest.fn() } }));
jest.mock('../src/shared/utils/staffEmail', () => ({ deliverStaffPasswordReset: jest.fn() }));
jest.mock('../src/shared/utils/password', () => ({ hashPassword: jest.fn<any>().mockResolvedValue('new-hash'), comparePassword: jest.fn<any>() }));
const db = prisma as any;
const compare = comparePassword as any;

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ passwordHash: 'old-hash', isActive: true, isPlatformAdmin: false, propertyId: 2 });
  compare.mockResolvedValue(true);
});

test('changes the password, signs out other sessions and records it', async () => {
  await changeStaffPassword(7, 2, 'old-password', 'new-password');
  const [update, audit] = db.$transaction.mock.calls[0][0];
  expect(update.where).toEqual({ userId: 7 });
  expect(update.data).toMatchObject({ passwordHash: 'new-hash', passwordResetTokenHash: null, sessionVersion: expect.any(String) });
  expect(audit.data).toMatchObject({ userId: 7, propertyId: 2, entityType: 'User', action: 'PasswordChanged' });
});

test('wrong current password changes nothing', async () => {
  compare.mockResolvedValue(false);
  await expect(changeStaffPassword(7, 2, 'wrong', 'new-password')).rejects.toThrow('current password is not correct');
  expect(db.$transaction).not.toHaveBeenCalled();
});

test('rejects weak, unchanged or missing passwords before any lookup', async () => {
  await expect(changeStaffPassword(7, 2, 'old-password', 'short')).rejects.toThrow('at least 8');
  await expect(changeStaffPassword(7, 2, 'same-password', 'same-password')).rejects.toThrow('different');
  await expect(changeStaffPassword(7, 2, '', 'new-password')).rejects.toThrow('current password');
  expect(db.user.findUnique).not.toHaveBeenCalled();
});

test('platform admins and inactive accounts cannot use the staff change', async () => {
  db.user.findUnique.mockResolvedValueOnce({ passwordHash: 'h', isActive: true, isPlatformAdmin: true, propertyId: null });
  await expect(changeStaffPassword(1, 0, 'old-password', 'new-password')).rejects.toThrow('cannot change');
  db.user.findUnique.mockResolvedValueOnce({ passwordHash: 'h', isActive: false, isPlatformAdmin: false, propertyId: 2 });
  await expect(changeStaffPassword(7, 2, 'old-password', 'new-password')).rejects.toThrow('cannot change');
  expect(db.$transaction).not.toHaveBeenCalled();
});
