// Super Admin (platform administrator) accounts: sign-in, invitations, activation, account
// management and password recovery. Platform admins are `users` rows with isPlatformAdmin = true
// and no property. Hotel staff and guest authentication are not handled here.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { comparePassword, hashPassword } from '../../shared/utils/password';
import { issueSession } from '../auth/auth.service';
import {
  deliverPlatformEmailChange, deliverPlatformEmailChangedNotice, deliverPlatformInvitation, deliverPlatformPasswordReset,
} from '../../shared/utils/platformEmail';

export class PlatformAdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_MS = 24 * 60 * 60_000;
const RESET_MS = 30 * 60_000;
const EMAIL_CHANGE_MS = 60 * 60_000;
// Keeps the time of a failed sign-in similar whether or not the account exists.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ||= hashPassword(randomBytes(16).toString('hex')));
const LAST_ADMIN_LOCK = 742_001; // pg advisory lock key serialising changes to the active-admin count

/** Where-clause for a platform admin row (never a hotel account). */
export const PLATFORM = { isPlatformAdmin: true, propertyId: null } as const;
/** Active admins: pending invitations do not count. */
const ACTIVE = { ...PLATFORM, isActive: true, invitationPending: false } as const;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new PlatformAdminError('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) throw new PlatformAdminError('Enter a valid email address.');
  return email;
}

export function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 72) {
    throw new PlatformAdminError('Use a password of at least 12 characters and at most 72 bytes.');
  }
}

const newSessionVersion = () => randomBytes(16).toString('hex');

async function audit(actorId: number | null, targetId: number, action: string, data: Record<string, unknown> = {}, db: any = prisma) {
  await db.auditLog.create({ data: { userId: actorId, propertyId: null, entityType: 'PlatformAdmin', entityId: targetId, action, newData: data } });
}

// ---------------------------------------------------------------- sign-in

/**
 * Email + password sign-in for platform admins only. A phone number is accepted only for an admin
 * that has no verified email yet (the original bootstrap account); it stops working once an email is set.
 */
export async function platformLogin(identifier: unknown, password: unknown) {
  const invalid = new PlatformAdminError('Invalid email or password.', 401);
  if (typeof identifier !== 'string' || typeof password !== 'string' || !password) throw invalid;
  const id = identifier.trim();
  let where: any;
  if (id.includes('@')) where = { ...PLATFORM, email: id.toLowerCase() };
  else if (/^\d{10}$/.test(id)) where = { ...PLATFORM, phone: id, email: null };
  else throw invalid;

  const user = await prisma.user.findFirst({ where, select: { userId: true, passwordHash: true, isActive: true, invitationPending: true } });
  const ok = await comparePassword(password, user?.passwordHash || await getDummyHash());
  if (!user || !ok || !user.isActive || user.invitationPending) throw invalid;

  await prisma.user.update({ where: { userId: user.userId }, data: { lastLoginAt: new Date() } });
  const session = await issueSession(user.userId, 0);
  if (!session.success) throw invalid;
  return session;
}

// ---------------------------------------------------------------- administrators

const adminFields = { userId: true, fullName: true, email: true, phone: true, isActive: true, invitationPending: true, invitationExpiresAt: true, lastLoginAt: true, createdAt: true } as const;

export async function listAdmins() {
  return prisma.user.findMany({ where: PLATFORM, select: adminFields, orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }] });
}

export async function getMe(userId: number) {
  const me = await prisma.user.findFirst({ where: { ...PLATFORM, userId }, select: adminFields });
  if (!me) throw new PlatformAdminError('Account not found.', 404);
  return me;
}

export async function listActivity() {
  return prisma.auditLog.findMany({
    where: { entityType: 'PlatformAdmin', propertyId: null },
    orderBy: { createdAt: 'desc' }, take: 50,
    select: { auditLogId: true, action: true, entityId: true, userId: true, createdAt: true, newData: true, user: { select: { fullName: true } } },
  });
}

async function platformRole() {
  return prisma.role.upsert({
    where: { roleName: 'Platform Admin' }, update: {},
    create: { roleName: 'Platform Admin', description: 'Platform-level property administration', isSystem: true },
  });
}

function inviteToken() {
  const token = randomBytes(32).toString('hex');
  return { token, fields: { invitationTokenHash: digest(token), invitationExpiresAt: new Date(Date.now() + INVITE_MS), invitationPending: true } };
}

export async function inviteAdmin(actorId: number, fullName: unknown, emailInput: unknown) {
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  if (name.length < 2 || name.length > 200) throw new PlatformAdminError('Enter the administrator’s full name.');
  const email = normalizeEmail(emailInput);
  if (await prisma.user.findUnique({ where: { email }, select: { userId: true } })) {
    throw new PlatformAdminError('That email is already used by another account.');
  }
  const role = await platformRole();
  const { token, fields } = inviteToken();
  const created = await prisma.user.create({ data: {
    propertyId: null, fullName: name, email, username: `platform_admin_${randomBytes(8).toString('hex')}`,
    // Unusable until the invitation is accepted.
    passwordHash: await hashPassword(randomBytes(32).toString('hex')),
    roleId: role.roleId, isPlatformAdmin: true, isActive: true, ...fields,
  }, select: { userId: true } });
  await audit(actorId, created.userId, 'PlatformAdminInvited', { email });
  const delivered = await sendSafely(() => deliverPlatformInvitation(email, token));
  return { userId: created.userId, emailSent: delivered };
}

export async function resendInvite(actorId: number, targetId: number) {
  const target = await prisma.user.findFirst({ where: { ...PLATFORM, userId: targetId, invitationPending: true, isActive: true }, select: { email: true } });
  if (!target?.email) throw new PlatformAdminError('This invitation is no longer pending.');
  const { token, fields } = inviteToken();
  await prisma.user.update({ where: { userId: targetId }, data: fields });
  await audit(actorId, targetId, 'PlatformAdminInviteResent', { email: target.email });
  return { emailSent: await sendSafely(() => deliverPlatformInvitation(target.email!, token)) };
}

export async function acceptInvitation(token: unknown, password: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new PlatformAdminError('Invalid or expired invitation.');
  assertPassword(password);
  const passwordHash = await hashPassword(password);
  const target = await prisma.user.findFirst({ where: { ...PLATFORM, invitationTokenHash: digest(token) }, select: { userId: true } });
  const updated = await prisma.user.updateMany({
    where: { ...PLATFORM, invitationTokenHash: digest(token), invitationPending: true, isActive: true, invitationExpiresAt: { gt: new Date() } },
    data: { passwordHash, invitationPending: false, invitationTokenHash: null, invitationExpiresAt: null, sessionVersion: newSessionVersion() },
  });
  if (!updated.count || !target) throw new PlatformAdminError('Invalid or expired invitation. Ask an administrator for a new link.');
  await audit(target.userId, target.userId, 'PlatformAdminInvitationAccepted');
}

/**
 * Deactivate an admin or revoke a pending invitation. Serialised with an advisory lock so two
 * concurrent deactivations can never leave zero active administrators.
 */
export async function deactivateAdmin(actorId: number, targetId: number) {
  if (actorId === targetId) throw new PlatformAdminError('You cannot deactivate your own account.');
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LAST_ADMIN_LOCK})`;
    const target = await tx.user.findFirst({ where: { ...PLATFORM, userId: targetId }, select: { isActive: true, invitationPending: true } });
    if (!target) throw new PlatformAdminError('Administrator not found.', 404);
    if (!target.isActive) throw new PlatformAdminError('This administrator is already inactive.');
    if (!target.invitationPending) {
      const othersActive = await tx.user.count({ where: { ...ACTIVE, userId: { not: targetId } } });
      if (othersActive < 1) throw new PlatformAdminError('At least one active administrator must remain.', 409);
    }
    await tx.user.update({ where: { userId: targetId }, data: {
      isActive: false, invitationPending: false, invitationTokenHash: null, invitationExpiresAt: null,
      passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: newSessionVersion(),
    } });
    await audit(actorId, targetId, target.invitationPending ? 'PlatformAdminInviteRevoked' : 'PlatformAdminDeactivated', {}, tx);
  });
}

/** Reactivates the account; all old sessions stay invalid. The admin can use "Forgot password" if needed. */
export async function reactivateAdmin(actorId: number, targetId: number) {
  const updated = await prisma.user.updateMany({ where: { ...PLATFORM, userId: targetId, isActive: false }, data: { isActive: true, sessionVersion: newSessionVersion() } });
  if (!updated.count) throw new PlatformAdminError('Administrator not found or already active.', 404);
  await audit(actorId, targetId, 'PlatformAdminReactivated');
}

// ---------------------------------------------------------------- own account

export async function updateName(userId: number, fullName: unknown) {
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  if (name.length < 2 || name.length > 200) throw new PlatformAdminError('Enter your full name.');
  await prisma.user.updateMany({ where: { ...ACTIVE, userId }, data: { fullName: name } });
  await audit(userId, userId, 'PlatformAdminNameChanged', { fullName: name });
}

async function verifyCurrentPassword(userId: number, currentPassword: unknown) {
  const me = await prisma.user.findFirst({ where: { ...ACTIVE, userId }, select: { passwordHash: true, email: true, sessionVersion: true } });
  if (!me || typeof currentPassword !== 'string' || !await comparePassword(currentPassword, me.passwordHash)) {
    throw new PlatformAdminError('Your current password is incorrect.', 403);
  }
  return me;
}

/** Changes the password, signs out every other session and returns fresh tokens for this one. */
export async function changePassword(userId: number, currentPassword: unknown, newPassword: unknown) {
  assertPassword(newPassword);
  await verifyCurrentPassword(userId, currentPassword);
  await prisma.user.update({ where: { userId }, data: {
    passwordHash: await hashPassword(newPassword), sessionVersion: newSessionVersion(),
    passwordResetTokenHash: null, passwordResetExpiresAt: null,
  } });
  await audit(userId, userId, 'PlatformAdminPasswordChanged');
  return issueSession(userId, 0);
}

// Email change tokens are stateless (no migration): an HMAC over the account, the old email and
// the session version. Once the email or password changes the token can never be used again.
const emailSecret = () => {
  const secret = process.env.PLATFORM_EMAIL_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret || (process.env.NODE_ENV === 'production' && secret === 'your-secret-key')) throw new PlatformAdminError('Email verification is not configured.', 503);
  return createHmac('sha256', secret).update('platform-admin-email-change').digest();
};
const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url');
const sign = (body: string) => createHmac('sha256', emailSecret()).update(body).digest();

export function createEmailChangeToken(payload: { u: number; e: string; o: string | null; s: string | null; x: number }) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(sign(body))}`;
}

function readEmailChangeToken(token: unknown) {
  const invalid = new PlatformAdminError('Invalid or expired verification link.');
  if (typeof token !== 'string' || token.length > 1000) throw invalid;
  const [body, mac] = token.split('.');
  if (!body || !mac) throw invalid;
  const expected = sign(body);
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid;
  let payload: any;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw invalid; }
  if (!payload || typeof payload.u !== 'number' || typeof payload.e !== 'string' || typeof payload.x !== 'number' || payload.x < Date.now()) throw invalid;
  return payload as { u: number; e: string; o: string | null; s: string | null; x: number };
}

/** Requires the current password; the new address only takes effect after it is verified. */
export async function requestEmailChange(userId: number, currentPassword: unknown, newEmailInput: unknown) {
  const email = normalizeEmail(newEmailInput);
  const me = await verifyCurrentPassword(userId, currentPassword);
  if (me.email === email) throw new PlatformAdminError('That is already your email address.');
  if (await prisma.user.findUnique({ where: { email }, select: { userId: true } })) throw new PlatformAdminError('That email is already used by another account.');
  const token = createEmailChangeToken({ u: userId, e: email, o: me.email || null, s: me.sessionVersion || null, x: Date.now() + EMAIL_CHANGE_MS });
  await audit(userId, userId, 'PlatformAdminEmailChangeRequested', { newEmail: email });
  await deliverPlatformEmailChange(email, token);
}

export async function confirmEmailChange(token: unknown) {
  const payload = readEmailChangeToken(token);
  if (await prisma.user.findFirst({ where: { email: payload.e, userId: { not: payload.u } }, select: { userId: true } })) {
    throw new PlatformAdminError('That email is already used by another account.');
  }
  // Atomic compare: the old email and session version must still match, so the link works once.
  const updated = await prisma.user.updateMany({
    where: { ...ACTIVE, userId: payload.u, email: payload.o, sessionVersion: payload.s },
    data: { email: payload.e, sessionVersion: newSessionVersion(), passwordResetTokenHash: null, passwordResetExpiresAt: null },
  });
  if (!updated.count) throw new PlatformAdminError('Invalid or expired verification link.');
  await audit(payload.u, payload.u, 'PlatformAdminEmailChanged', { oldEmail: payload.o, newEmail: payload.e });
  if (payload.o) await sendSafely(() => deliverPlatformEmailChangedNotice(payload.o!, payload.e));
}

// ---------------------------------------------------------------- forgotten password

export async function requestPasswordReset(emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findFirst({ where: { ...ACTIVE, email }, select: { userId: true } });
  if (!user) return; // same response either way
  const token = randomBytes(32).toString('hex');
  await prisma.user.update({ where: { userId: user.userId }, data: { passwordResetTokenHash: digest(token), passwordResetExpiresAt: new Date(Date.now() + RESET_MS) } });
  await audit(null, user.userId, 'PlatformAdminPasswordResetRequested');
  await sendSafely(() => deliverPlatformPasswordReset(email, token));
}

export async function resetPassword(token: unknown, password: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new PlatformAdminError('Invalid or expired reset link.');
  assertPassword(password);
  const passwordHash = await hashPassword(password);
  const target = await prisma.user.findFirst({ where: { ...PLATFORM, passwordResetTokenHash: digest(token) }, select: { userId: true } });
  const updated = await prisma.user.updateMany({
    where: { ...ACTIVE, passwordResetTokenHash: digest(token), passwordResetExpiresAt: { gt: new Date() } },
    data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: newSessionVersion() },
  });
  if (!updated.count || !target) throw new PlatformAdminError('Invalid or expired reset link. Request a new one.');
  await audit(null, target.userId, 'PlatformAdminPasswordReset');
}

async function sendSafely(send: () => Promise<void>) {
  try { await send(); return true; } catch (error) {
    console.error('Platform admin email delivery failed', error instanceof Error ? error.message : error);
    return false;
  }
}
