import { jest, test, expect, beforeEach } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { inviteStaff } from '../src/modules/user/invitation.service';
import { deliverStaffInvitation } from '../src/shared/utils/staffEmail';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { role: { findUnique: jest.fn() }, user: { create: jest.fn() } } }));
jest.mock('../src/shared/utils/password', () => ({ hashPassword: jest.fn<any>().mockResolvedValue('random-password-hash') }));
jest.mock('../src/shared/utils/staffEmail', () => ({ deliverStaffInvitation: jest.fn() }));
const db = prisma as any;
const input = { fullName: 'Receptionist One', username: 'desk-one', email: 'desk@example.test' };
beforeEach(() => {
  jest.clearAllMocks();
  db.role.findUnique.mockResolvedValue({ roleId: 27, roleName: 'Receptionist' });
  db.user.create.mockResolvedValue({ userId: 91 });
  (deliverStaffInvitation as any).mockResolvedValue({ mode: 'simulation' });
});
test('creates invitations without a browser-supplied role ID', async () => {
  const result = await inviteStaff(5, input);
  expect(db.role.findUnique).toHaveBeenCalledWith({ where: { roleName: 'Receptionist' } });
  expect(db.user.create.mock.calls[0][0].data).toMatchObject({ propertyId: 5, roleId: 27, isActive: false, invitationPending: true });
  expect(result.user.userId).toBe(91);
});
test('always assigns the configured receptionist role despite supplied role or hotel overrides', async () => {
  await inviteStaff(5, { ...input, roleId: 1, propertyId: 999, isActive: true });
  expect(db.user.create.mock.calls[0][0].data).toMatchObject({ propertyId: 5, roleId: 27, isActive: false });
});
test('gives a readable configuration error when the role is missing', async () => {
  db.role.findUnique.mockResolvedValue(null);
  await expect(inviteStaff(5, input)).rejects.toThrow('Receptionist role is not configured');
  expect(db.user.create).not.toHaveBeenCalled(); expect(deliverStaffInvitation).not.toHaveBeenCalled();
});
test('rejects incomplete invitation fields before querying roles', async () => {
  await expect(inviteStaff(5, { ...input, email: 'invalid' })).rejects.toThrow('valid email');
  expect(db.role.findUnique).not.toHaveBeenCalled();
});
