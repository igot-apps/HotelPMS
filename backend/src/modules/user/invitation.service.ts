import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { hashPassword } from '../../shared/utils/password';
import { deliverStaffInvitation } from '../../shared/utils/staffEmail';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenData = () => {
  const token = randomBytes(32).toString('hex');
  return { token, invitationTokenHash: digest(token), invitationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
};

export async function inviteStaff(propertyId: number, data: any) {
  if (!propertyId) throw new Error('A hotel account is required.');
  if (!data.fullName?.trim() || !data.username?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) {
    throw new Error('Name, username, and a valid email are required.');
  }
  // Invitations have a fixed role; never depend on a client-side roles request or database IDs.
  const role = await prisma.role.findUnique({ where: { roleName: 'Receptionist' } });
  if (!role) throw new Error('The Receptionist role is not configured. Ask the platform administrator to run the role setup.');
  const { token, ...fields } = tokenData();
  const email = data.email.trim().toLowerCase();
  const preview = await deliverStaffInvitation(email, token);
  const user = await prisma.user.create({ data: {
    propertyId, fullName: data.fullName.trim(), username: data.username.trim(), email,
    roleId: role.roleId, passwordHash: await hashPassword(randomBytes(32).toString('hex')),
    isActive: false, invitationPending: true, ...fields,
  }, select: { userId: true } });
  return { user, preview };
}

export async function resendInvitation(propertyId: number, userId: number) {
  const user = await prisma.user.findFirst({ where: { userId, propertyId, invitationPending: true } });
  if (!user?.email) throw new Error('Pending invitation not found.');
  const { token, ...fields } = tokenData();
  const preview = await deliverStaffInvitation(user.email, token);
  const updated = await prisma.user.updateMany({ where: { userId, propertyId, invitationPending: true }, data: fields });
  if (!updated.count) throw new Error('Invitation is no longer pending.');
  return { preview };
}

export async function acceptInvitation(token: string, password: string) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid or expired invitation.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) throw new Error('Use a password of at least 8 characters and at most 72 bytes.');
  const pending = await prisma.user.findUnique({ where: { invitationTokenHash: digest(token) } });
  if (!pending?.invitationPending || !pending.invitationExpiresAt || pending.invitationExpiresAt <= new Date()) {
    throw new Error('Invalid or expired invitation. Ask your manager for a new link.');
  }
  const passwordHash = await hashPassword(password);
  const result = await prisma.user.updateMany({ where: {
    invitationTokenHash: digest(token), invitationPending: true, invitationExpiresAt: { gt: new Date() },
    property: { isActive: true, status: 'Active' },
  }, data: { passwordHash, isActive: true, invitationPending: false, invitationTokenHash: null, invitationExpiresAt: null } });
  if (!result.count) throw new Error('Invalid or expired invitation. Ask your manager for a new link.');
}
