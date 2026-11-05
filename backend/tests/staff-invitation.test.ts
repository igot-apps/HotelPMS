import { jest, test, expect, beforeEach } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { inviteStaff } from '../src/modules/user/invitation.service';
import { deliverStaffInvitation } from '../src/shared/utils/staffEmail';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { role: { findUnique: jest.fn() }, user: { create: jest.fn() }, $transaction: jest.fn() } }));
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
  expect(db.user.create.mock.invocationCallOrder[0]).toBeLessThan((deliverStaffInvitation as jest.Mock).mock.invocationCallOrder[0]);
});
test('always assigns the configured receptionist role despite supplied role or hotel overrides', async () => {
  await inviteStaff(5, { ...input, roleId: 1, propertyId: 999, isActive: true });
  expect(db.user.create.mock.calls[0][0].data).toMatchObject({ propertyId: 5, roleId: 27, isActive: false });
});
test('bootstraps a missing role with front-desk permissions without granting manager privileges', async () => {
  db.role.findUnique.mockResolvedValue(null);
  const tx = { role: { upsert: jest.fn<any>().mockResolvedValue({ roleId: 27 }) }, permission: { upsert: jest.fn<any>().mockResolvedValue({ permissionId: 1 }) }, rolePermission: { createMany: jest.fn<any>() } };
  db.$transaction.mockImplementation((work: any) => work(tx));
  await inviteStaff(5, input);
  expect(tx.role.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { roleName: 'Receptionist' }, update: {} }));
  const granted = tx.permission.upsert.mock.calls.map((args: any) => args[0].where.code);
  expect(granted).toEqual(['CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest', 'CanViewRooms', 'CanUpdateRoomStatus', 'CanProcessPayments']);
  expect(tx.rolePermission.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  expect(db.user.create.mock.calls[0][0].data.roleId).toBe(27);
});
test('preserves existing role permissions without overwriting custom configuration', async () => {
  await inviteStaff(5, input);
  expect(db.$transaction).not.toHaveBeenCalled();
});
test('rejects incomplete invitation fields before querying roles', async () => {
  await expect(inviteStaff(5, { ...input, email: 'invalid' })).rejects.toThrow('valid email');
  expect(db.role.findUnique).not.toHaveBeenCalled();
});
test('keeps a pending account when delivery fails so the manager can retry', async () => {
  (deliverStaffInvitation as any).mockRejectedValueOnce(new Error('sender not verified'));
  const result = await inviteStaff(5, input);
  expect(result.user.userId).toBe(91);
  expect(result.delivery).toMatchObject({ mode: 'failed', to: input.email });
  expect(JSON.stringify(result.delivery)).not.toContain('sender not verified');
});
