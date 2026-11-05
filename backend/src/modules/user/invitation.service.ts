import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import { hashPassword } from '../../shared/utils/password';
import { deliverStaffInvitation } from '../../shared/utils/staffEmail';
import { DEFAULT_RECEPTIONIST_CORRECTIONS } from '../reservation/correction-policy';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const deliveryFailureMessage = (error: unknown) =>
  error instanceof Error && /unable to fetch data|fetch failed|network/i.test(error.message)
    ? 'Could not connect to Resend. Check backend network access, then use Resend invite.'
    : 'Invitation email was not sent. Check the backend email settings, then use Resend invite.';
const tokenData = () => {
  const token = randomBytes(32).toString('hex');
  return { token, invitationTokenHash: digest(token), invitationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
};

export async function inviteStaff(propertyId: number, data: any) {
  if (!propertyId) throw new Error('A hotel account is required.');
  if (!data.fullName?.trim() || !data.username?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) {
    throw new Error('Name, username, and a valid email are required.');
  }
  // Allow only the two staff roles shown in Staff Management.
  const roleName = data.role === 'Housekeeper' ? 'Housekeeper' : data.role === undefined || data.role === 'Receptionist' ? 'Receptionist' : null;
  if (!roleName) throw new Error('Choose Receptionist or Housekeeper.');
  if (roleName === 'Housekeeper') {
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { housekeepingEnabled: true } });
    if (!property?.housekeepingEnabled) throw new Error('Turn on Housekeeping before inviting a housekeeper.');
  }
  const role = await prisma.role.findUnique({ where: { roleName } })
    || await prisma.$transaction(async tx => {
      const staffRole = await tx.role.upsert({ where: { roleName }, update: {},
        create: { roleName, description: roleName === 'Housekeeper' ? 'Room cleaning and readiness' : 'Front desk operations', isSystem: true },
      });
      const codes = roleName === 'Housekeeper' ? ['CanManageHousekeeping'] : ['CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest', 'CanViewRooms', 'CanUpdateRoomStatus', 'CanProcessPayments'];
      const permissions = [];
      for (const code of codes) {
        permissions.push(await tx.permission.upsert({ where: { code }, update: {}, create: { code, name: code.replace(/^Can/, '').replace(/([a-z])([A-Z])/g, '$1 $2'), category: 'Front desk' } }));
      }
      await tx.rolePermission.createMany({ data: permissions.map(permission => ({ roleId: staffRole.roleId, permissionId: permission.permissionId })), skipDuplicates: true });
      return staffRole;
    });
  const { token, ...fields } = tokenData();
  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.create({ data: {
    propertyId, fullName: data.fullName.trim(), username: data.username.trim(), email,
    roleId: role.roleId, passwordHash: await hashPassword(randomBytes(32).toString('hex')),
    correctionPermissions: roleName === 'Receptionist' ? [...DEFAULT_RECEPTIONIST_CORRECTIONS] : [],
    isActive: false, invitationPending: true, ...fields,
  }, select: { userId: true } });
  let delivery;
  try {
    delivery = await deliverStaffInvitation(email, token, fields.invitationTokenHash);
  } catch (error) {
    console.error('Staff invitation delivery failed', { userId: user.userId, error });
    delivery = { mode: 'failed' as const, to: email, message: deliveryFailureMessage(error) };
  }
  return { user, delivery };
}

export async function resendInvitation(propertyId: number, userId: number) {
  const user = await prisma.user.findFirst({ where: { userId, propertyId, invitationPending: true } });
  if (!user?.email) throw new Error('Pending invitation not found.');
  const { token, ...fields } = tokenData();
  const updated = await prisma.user.updateMany({ where: { userId, propertyId, invitationPending: true }, data: fields });
  if (!updated.count) throw new Error('Invitation is no longer pending.');
  try {
    const delivery = await deliverStaffInvitation(user.email, token, fields.invitationTokenHash);
    return { delivery };
  } catch (error) {
    console.error('Staff invitation resend failed', { userId, error });
    return { delivery: { mode: 'failed' as const, to: user.email, message: deliveryFailureMessage(error) } };
  }
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
