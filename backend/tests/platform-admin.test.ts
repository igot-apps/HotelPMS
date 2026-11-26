import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { prisma } from '../src/shared/utils/prisma';
import * as email from '../src/shared/utils/platformEmail';
import { issueSession } from '../src/modules/auth/auth.service';
import * as service from '../src/modules/platform-admin/platform-admin.service';
import { platformAuthRoutes, resetRateLimits } from '../src/modules/platform-admin/platform-admin.routes';

jest.mock('../src/shared/utils/prisma', () => {
  const user = { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }), updateMany: jest.fn(), create: jest.fn(), count: jest.fn() };
  const auditLog = { create: jest.fn(), findMany: jest.fn() };
  const tx = { user, auditLog, $executeRaw: jest.fn() };
  return { prisma: { user, auditLog, role: { upsert: jest.fn<any>().mockResolvedValue({ roleId: 9 }) }, $transaction: jest.fn((fn: any) => fn(tx)), tx } };
});
jest.mock('../src/shared/utils/password', () => ({
  hashPassword: jest.fn<any>().mockResolvedValue('hashed'),
  comparePassword: jest.fn(async (plain: string, hash: string) => hash === `hash:${plain}`),
}));
jest.mock('../src/shared/utils/platformEmail', () => ({
  deliverPlatformInvitation: jest.fn(), deliverPlatformPasswordReset: jest.fn(), deliverPlatformEmailChange: jest.fn(), deliverPlatformEmailChangedNotice: jest.fn(),
}));
jest.mock('../src/modules/auth/auth.service', () => ({ issueSession: jest.fn<any>().mockResolvedValue({ success: true, accessToken: 'a', refreshToken: 'r', user: { userId: 1 } }) }));
jest.mock('../src/shared/middleware/auth.middleware', () => ({ authenticate: jest.fn(), requirePlatformAdmin: jest.fn() }));

const db = prisma as any;
const admin = { userId: 1, passwordHash: 'hash:correct-password', isActive: true, invitationPending: false, email: 'boss@example.com', sessionVersion: 'v1' };

beforeEach(() => {
  jest.clearAllMocks(); resetRateLimits();
  process.env.JWT_SECRET = 'test-secret';
  db.user.findFirst.mockResolvedValue(admin);
  db.user.findUnique.mockResolvedValue(null);
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.create.mockResolvedValue({ userId: 5 });
  db.user.count.mockResolvedValue(1);
});

// ---------- sign-in
test('email login only searches platform admins and issues a platform session', async () => {
  await service.platformLogin('Boss@Example.com', 'correct-password');
  expect(db.user.findFirst.mock.calls[0][0].where).toEqual({ isPlatformAdmin: true, propertyId: null, email: 'boss@example.com' });
  expect(issueSession).toHaveBeenCalledWith(1, 0);
});

test('phone login works only while the admin has no email', async () => {
  await service.platformLogin('0241234567', 'correct-password');
  expect(db.user.findFirst.mock.calls[0][0].where).toEqual({ isPlatformAdmin: true, propertyId: null, phone: '0241234567', email: null });
});

test.each([
  ['wrong password', admin, 'nope'],
  ['unknown account', null, 'correct-password'],
  ['deactivated', { ...admin, isActive: false }, 'correct-password'],
  ['pending invitation', { ...admin, invitationPending: true }, 'correct-password'],
])('login fails with one generic message: %s', async (_label, row, password) => {
  db.user.findFirst.mockResolvedValue(row);
  await expect(service.platformLogin('boss@example.com', password)).rejects.toThrow('Invalid email or password.');
  expect(issueSession).not.toHaveBeenCalled();
});

test('dedicated login route rate-limits repeated attempts on one email', async () => {
  const app = express(); app.use(express.json()); app.use('/api/auth/platform', platformAuthRoutes);
  db.user.findFirst.mockResolvedValue(admin);
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await request(app).post('/api/auth/platform/login').send({ email: 'boss@example.com', password: 'nope' })).status);
  expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
  expect(statuses[5]).toBe(429);
});

// ---------- invitations
test('invitation stores only a token hash, counts as pending and emails the link', async () => {
  const result = await service.inviteAdmin(1, 'New Admin', 'New@Example.com');
  const data = db.user.create.mock.calls[0][0].data;
  const token = (email.deliverPlatformInvitation as any).mock.calls[0][1];
  expect(data).toMatchObject({ propertyId: null, isPlatformAdmin: true, invitationPending: true, email: 'new@example.com' });
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(data.invitationTokenHash).not.toBe(token);
  expect(result.emailSent).toBe(true);
  expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'PlatformAdminInvited', propertyId: null, userId: 1 });
});

test('accepting an invitation is scoped to platform admins and enforces the password policy', async () => {
  await expect(service.acceptInvitation('a'.repeat(64), 'short')).rejects.toThrow('at least 12');
  await service.acceptInvitation('a'.repeat(64), 'a-long-password');
  expect(db.user.updateMany.mock.calls[0][0].where).toMatchObject({ isPlatformAdmin: true, propertyId: null, invitationPending: true, invitationExpiresAt: { gt: expect.any(Date) } });
});

// ---------- deactivation
test('an admin cannot deactivate themself', async () => {
  await expect(service.deactivateAdmin(1, 1)).rejects.toThrow('your own account');
  expect(db.$transaction).not.toHaveBeenCalled();
});

test('the last active admin cannot be deactivated; pending invitations do not count', async () => {
  db.user.findFirst.mockResolvedValue({ isActive: true, invitationPending: false });
  db.user.count.mockResolvedValue(0);
  await expect(service.deactivateAdmin(1, 2)).rejects.toThrow('At least one active administrator');
  expect(db.tx.$executeRaw).toHaveBeenCalled(); // serialised with an advisory lock
  expect(db.user.count.mock.calls[0][0].where).toMatchObject({ isActive: true, invitationPending: false, isPlatformAdmin: true, propertyId: null, userId: { not: 2 } });
  expect(db.user.update).not.toHaveBeenCalled();
});

test('deactivation signs the admin out everywhere and is audited', async () => {
  db.user.findFirst.mockResolvedValue({ isActive: true, invitationPending: false });
  await service.deactivateAdmin(1, 2);
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({ isActive: false, sessionVersion: expect.any(String), passwordResetTokenHash: null });
  expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('PlatformAdminDeactivated');
});

// ---------- password
test('changing password requires the current password and rotates the session version', async () => {
  await expect(service.changePassword(1, 'wrong', 'a-long-new-password')).rejects.toThrow('current password is incorrect');
  await service.changePassword(1, 'correct-password', 'a-long-new-password');
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({ passwordHash: 'hashed', sessionVersion: expect.any(String) });
});

test('forgotten password: unknown emails get no link; known admins get a hashed one-time token', async () => {
  db.user.findFirst.mockResolvedValueOnce(null);
  await service.requestPasswordReset('ghost@example.com');
  expect(email.deliverPlatformPasswordReset).not.toHaveBeenCalled();
  await service.requestPasswordReset('boss@example.com');
  expect(db.user.findFirst.mock.calls[1][0].where).toMatchObject({ isPlatformAdmin: true, propertyId: null, isActive: true, invitationPending: false, email: 'boss@example.com' });
  const token = (email.deliverPlatformPasswordReset as any).mock.calls[0][1];
  expect(db.user.update.mock.calls[0][0].data.passwordResetTokenHash).not.toBe(token);
});

test('reset consumes the token for platform admins only and signs out other sessions', async () => {
  await service.resetPassword('b'.repeat(64), 'a-long-new-password');
  const call = db.user.updateMany.mock.calls[0][0];
  expect(call.where).toMatchObject({ isPlatformAdmin: true, propertyId: null, passwordResetExpiresAt: { gt: expect.any(Date) } });
  expect(call.data).toMatchObject({ passwordResetTokenHash: null, sessionVersion: expect.any(String) });
  db.user.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(service.resetPassword('b'.repeat(64), 'a-long-new-password')).rejects.toThrow('Invalid or expired');
});

// ---------- email change
test('email change requires the current password and only applies after verification', async () => {
  await expect(service.requestEmailChange(1, 'wrong', 'new@example.com')).rejects.toThrow('current password is incorrect');
  await service.requestEmailChange(1, 'correct-password', 'New@Example.com');
  expect(db.user.update).not.toHaveBeenCalled();
  expect(db.user.updateMany).not.toHaveBeenCalled();
  const token = (email.deliverPlatformEmailChange as any).mock.calls[0][1];

  db.user.findFirst.mockResolvedValueOnce(null); // new email not used by anyone else
  await service.confirmEmailChange(token);
  const call = db.user.updateMany.mock.calls[0][0];
  expect(call.where).toMatchObject({ userId: 1, email: 'boss@example.com', sessionVersion: 'v1', isPlatformAdmin: true });
  expect(call.data).toMatchObject({ email: 'new@example.com', sessionVersion: expect.any(String) });
  expect(email.deliverPlatformEmailChangedNotice).toHaveBeenCalledWith('boss@example.com', 'new@example.com');
});

test('tampered or expired email-change links are rejected', async () => {
  const good = service.createEmailChangeToken({ u: 1, e: 'new@example.com', o: null, s: null, x: Date.now() + 60_000 });
  const [body, mac] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 2, e: 'evil@example.com', o: null, s: null, x: Date.now() + 60_000 })).toString('base64url');
  await expect(service.confirmEmailChange(`${forged}.${mac}`)).rejects.toThrow('Invalid or expired');
  const expired = service.createEmailChangeToken({ u: 1, e: 'new@example.com', o: null, s: null, x: Date.now() - 1 });
  await expect(service.confirmEmailChange(expired)).rejects.toThrow('Invalid or expired');
  expect(body).toBeTruthy();
  expect(db.user.updateMany).not.toHaveBeenCalled();
});

// ---------- default administrator
test('the default administrator cannot be deactivated or have its email changed', async () => {
  process.env.PLATFORM_DEFAULT_ADMIN_EMAIL = ' Boss@Example.com ';
  try {
    db.user.findFirst.mockResolvedValue({ isActive: true, invitationPending: false, email: 'boss@example.com' });
    db.user.count.mockResolvedValue(5);
    await expect(service.deactivateAdmin(2, 1)).rejects.toThrow('default administrator cannot be deactivated');
    expect(db.user.update).not.toHaveBeenCalled();

    db.user.findFirst.mockResolvedValue(admin);
    await expect(service.requestEmailChange(1, 'correct-password', 'other@example.com')).rejects.toThrow('cannot be changed');
    const token = service.createEmailChangeToken({ u: 1, e: 'other@example.com', o: 'boss@example.com', s: 'v1', x: Date.now() + 60_000 });
    await expect(service.confirmEmailChange(token)).rejects.toThrow('cannot be changed');
    expect(db.user.updateMany).not.toHaveBeenCalled();

    db.user.findMany.mockResolvedValue([{ userId: 1, email: 'boss@example.com' }, { userId: 2, email: 'x@example.com' }]);
    expect((await service.listAdmins()).map((a: any) => a.isDefault)).toEqual([true, false]);
  } finally { delete process.env.PLATFORM_DEFAULT_ADMIN_EMAIL; }
});

test('the default administrator is created automatically when missing, and restored if inactive', async () => {
  process.env.PLATFORM_DEFAULT_ADMIN_EMAIL = 'Owner@Example.com';
  try {
    db.user.findUnique.mockResolvedValueOnce(null);
    expect(await service.ensureDefaultAdmin()).toBe('created');
    expect(db.user.create.mock.calls[0][0].data).toMatchObject({ email: 'owner@example.com', isPlatformAdmin: true, propertyId: null, isActive: true });

    db.user.findUnique.mockResolvedValueOnce({ userId: 5, isPlatformAdmin: true, propertyId: null, isActive: false, invitationPending: false });
    expect(await service.ensureDefaultAdmin()).toBe('ok');
    expect(db.user.update.mock.calls[0][0].data).toMatchObject({ isActive: true, invitationPending: false });

    db.user.findUnique.mockResolvedValueOnce({ userId: 9, isPlatformAdmin: false, propertyId: 3, isActive: true });
    expect(await service.ensureDefaultAdmin()).toBe('conflict');
    expect(db.user.create).toHaveBeenCalledTimes(1);
  } finally { delete process.env.PLATFORM_DEFAULT_ADMIN_EMAIL; }
});

test('forgot password for the default email creates the account first, then sends the reset link', async () => {
  process.env.PLATFORM_DEFAULT_ADMIN_EMAIL = 'owner@example.com';
  try {
    db.user.findUnique.mockResolvedValueOnce(null);
    db.user.findFirst.mockResolvedValueOnce({ userId: 5 });
    await service.requestPasswordReset('owner@example.com');
    expect(db.user.create).toHaveBeenCalled();
    expect(email.deliverPlatformPasswordReset).toHaveBeenCalledWith('owner@example.com', expect.stringMatching(/^[a-f0-9]{64}$/));
  } finally { delete process.env.PLATFORM_DEFAULT_ADMIN_EMAIL; }
});

test('only inactive, never-used administrator records can be removed, and removal is audited', async () => {
  db.user.findFirst.mockResolvedValueOnce({ email: 'typo@example.com', isActive: true, lastLoginAt: null });
  await expect(service.removeUnusedAdmin(1, 14)).rejects.toThrow('Only inactive');
  db.user.findFirst.mockResolvedValueOnce({ email: 'used@example.com', isActive: false, lastLoginAt: new Date() });
  await expect(service.removeUnusedAdmin(1, 14)).rejects.toThrow('Only inactive');
  expect(db.user.deleteMany).not.toHaveBeenCalled();

  db.user.findFirst.mockResolvedValueOnce({ email: 'typo@example.com', isActive: false, lastLoginAt: null });
  await service.removeUnusedAdmin(1, 14);
  expect(db.user.deleteMany.mock.calls[0][0].where).toMatchObject({ userId: 14, isActive: false, lastLoginAt: null, isPlatformAdmin: true, propertyId: null });
  expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'PlatformAdminRemoved', entityId: 14, newData: { email: 'typo@example.com' } });
});
