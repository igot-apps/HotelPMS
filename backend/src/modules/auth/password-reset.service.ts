import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { hashPassword } from '../../shared/utils/password';
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
