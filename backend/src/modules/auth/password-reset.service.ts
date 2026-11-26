import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { comparePassword, hashPassword } from '../../shared/utils/password';
import { deliverStaffPasswordReset } from '../../shared/utils/staffEmail';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function requestStaffPasswordReset(email: unknown): Promise<void> {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 200) {
    throw new Error('Enter a valid email address.');
  }
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { userId: true, email: true, isActive: true, invitationPending: true, propertyId: true, isPlatformAdmin: true, property: { select: { isActive: true, status: true } } },
  });
  if (!user?.isActive || user.invitationPending || !user.propertyId || user.isPlatformAdmin || !user.property?.isActive || user.property.status !== 'Active' || !user.email) return;

  const token = randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { userId: user.userId },
    data: { passwordResetTokenHash: digest(token), passwordResetExpiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  try {
    await deliverStaffPasswordReset(user.email, token);
  } catch (error) {
    console.error('Staff password reset delivery failed', { userId: user.userId, error });
  }
}

export async function resetStaffPassword(token: unknown, password: unknown): Promise<void> {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid or expired reset link.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new Error('Use a password of at least 8 characters and at most 72 bytes.');
  }
  const tokenHash = digest(token);
  const passwordHash = await hashPassword(password);
  const updated = await prisma.user.updateMany({
    where: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { gt: new Date() },
      isActive: true,
      invitationPending: false,
      property: { isActive: true, status: 'Active' },
    },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      sessionVersion: randomBytes(16).toString('hex'),
    },
  });
  if (!updated.count) throw new Error('Invalid or expired reset link. Request a new one.');
}

/**
 * A signed-in hotel staff member changes their own password. Needs the current password,
 * signs out every other session (new sessionVersion) and records it in the activity log.
 */
export async function changeStaffPassword(userId: number, propertyId: number, currentPassword: unknown, newPassword: unknown): Promise<void> {
  if (typeof currentPassword !== 'string' || !currentPassword) throw new Error('Enter your current password.');
  if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword) > 72) {
    throw new Error('Use a password of at least 8 characters and at most 72 bytes.');
  }
  if (newPassword === currentPassword) throw new Error('Choose a new password that is different from your current one.');
  const user = await prisma.user.findUnique({ where: { userId }, select: { passwordHash: true, isActive: true, isPlatformAdmin: true, propertyId: true } });
  if (!user?.isActive || user.isPlatformAdmin || !user.propertyId) throw new Error('This account cannot change its password here.');
  if (!(await comparePassword(currentPassword, user.passwordHash))) throw new Error('Your current password is not correct.');
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { userId },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null, sessionVersion: randomBytes(16).toString('hex') },
    }),
    prisma.auditLog.create({ data: { userId, propertyId: propertyId || user.propertyId, entityType: 'User', entityId: userId, action: 'PasswordChanged', newData: { userId } } }),
  ]);
}
