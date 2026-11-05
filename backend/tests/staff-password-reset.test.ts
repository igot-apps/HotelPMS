import { beforeEach, expect, jest, test } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { deliverStaffPasswordReset } from '../src/shared/utils/staffEmail';
import { requestStaffPasswordReset, resetStaffPassword } from '../src/modules/auth/password-reset.service';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() } } }));
jest.mock('../src/shared/utils/staffEmail', () => ({ deliverStaffPasswordReset: jest.fn() }));
jest.mock('../src/shared/utils/password', () => ({ hashPassword: jest.fn<any>().mockResolvedValue('new-hash') }));
const db = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ userId: 7, email: 'desk@example.com', isActive: true, invitationPending: false, propertyId: 2, isPlatformAdmin: false, property: { isActive: true, status: 'Active' } });
  db.user.updateMany.mockResolvedValue({ count: 1 });
});

test('unknown and inactive staff never receive a reset link', async () => {
  db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ isActive: false });
  await requestStaffPasswordReset('unknown@example.com');
  await requestStaffPasswordReset('inactive@example.com');
  expect(db.user.update).not.toHaveBeenCalled();
  expect(deliverStaffPasswordReset).not.toHaveBeenCalled();
});

test('active hotel staff receives a random reset link with only its hash stored', async () => {
  await requestStaffPasswordReset(' DESK@example.com ');
  expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'desk@example.com' } }));
  const token = (deliverStaffPasswordReset as any).mock.calls[0][1];
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(db.user.update.mock.calls[0][0].data.passwordResetTokenHash).not.toBe(token);
  expect(db.user.update.mock.calls[0][0].data.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());
});

test('valid reset consumes the token and changes the session version atomically', async () => {
  await resetStaffPassword('a'.repeat(64), 'new-password');
  const call = db.user.updateMany.mock.calls[0][0];
  expect(call.where).toMatchObject({ passwordResetExpiresAt: { gt: expect.any(Date) }, isActive: true, invitationPending: false });
  expect(call.data).toMatchObject({ passwordHash: 'new-hash', passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: expect.any(String) });
  db.user.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(resetStaffPassword('a'.repeat(64), 'new-password')).rejects.toThrow('Invalid or expired');
});
