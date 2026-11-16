import { afterAll, beforeEach, expect, jest, test } from '@jest/globals';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const mock = () => jest.fn<(...args: any[]) => any>();
const db = {
  platformGuest: { findFirst: mock(), update: mock() },
  hotelGuestAccount: { findUnique: mock(), update: mock() },
};
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
jest.mock('resend', () => ({ Resend: function () { return { emails: { send: jest.fn() } }; } }));

import { changeGuestPassword, guestProfile, updateGuestProfile } from '../src/modules/public/guest-profile.service';

const originalSecret = process.env.JWT_SECRET;
afterAll(() => { if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; });

const guest = { guestId: 7, fullName: 'Ama Mensah', phone: '+233596546957', email: 'ama@example.com', centralPasswordHash: null as string | null };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  db.platformGuest.update.mockImplementation(async ({ data }: any) => ({ ...guest, ...data }));
});

test('shows the stored phone in local format', () => {
  expect(guestProfile(guest)).toEqual({ fullName: 'Ama Mensah', phone: '0596546957', email: 'ama@example.com' });
});

test('updates name and a new phone, and clears phone verification', async () => {
  db.platformGuest.findFirst.mockResolvedValue(null);
  await expect(updateGuestProfile(guest, { fullName: '  Ama  Owusu ', phone: '024 123 4567' })).resolves.toEqual({ fullName: 'Ama Owusu', phone: '0241234567', email: 'ama@example.com' });
  expect(db.platformGuest.update).toHaveBeenCalledWith({ where: { guestId: 7 }, data: { fullName: 'Ama Owusu', phone: '+233241234567', isPhoneVerified: false } });
});

test('keeps phone verification when only the name changes', async () => {
  await updateGuestProfile(guest, { fullName: 'Ama Owusu', phone: '0596546957' });
  expect(db.platformGuest.findFirst).not.toHaveBeenCalled();
  expect(db.platformGuest.update).toHaveBeenCalledWith({ where: { guestId: 7 }, data: { fullName: 'Ama Owusu' } });
});

test('rejects a phone already used by another guest', async () => {
  db.platformGuest.findFirst.mockResolvedValue({ guestId: 9 });
  await expect(updateGuestProfile(guest, { fullName: 'Ama', phone: '0241234567' })).rejects.toMatchObject({ status: 409 });
  expect(db.platformGuest.update).not.toHaveBeenCalled();
});

test.each([[{ fullName: 'A', phone: '0241234567' }], [{ fullName: 'Guest', phone: '0241234567' }], [{ fullName: 'Ama', phone: '+44 7911 123456' }]])('rejects invalid profile input %j', async input => {
  await expect(updateGuestProfile(guest, input)).rejects.toMatchObject({ status: 400 });
});

test('changes a hotel account password and issues a new session token', async () => {
  const passwordHash = await bcrypt.hash('oldpass1', 4);
  db.hotelGuestAccount.findUnique.mockResolvedValue({ propertyId: 3, email: 'ama@example.com', passwordHash, sessionVersion: 1 });
  db.hotelGuestAccount.update.mockImplementation(async () => ({ propertyId: 3, email: 'ama@example.com', sessionVersion: 2, platformGuest: guest }));
  const result = await changeGuestPassword(guest, 3, { currentPassword: 'oldpass1', newPassword: 'newpass22' });
  const update = db.hotelGuestAccount.update.mock.calls[0][0] as any;
  expect(update.data.sessionVersion).toEqual({ increment: 1 });
  expect(await bcrypt.compare('newpass22', update.data.passwordHash)).toBe(true);
  expect(jwt.verify(result.token, 'test-secret')).toMatchObject({ type: 'hotel_guest', propertyId: 3, sessionVersion: 2 });
});

test('rejects a wrong current password without signing the guest out', async () => {
  db.hotelGuestAccount.findUnique.mockResolvedValue({ passwordHash: await bcrypt.hash('oldpass1', 4) });
  await expect(changeGuestPassword(guest, 3, { currentPassword: 'wrong', newPassword: 'newpass22' })).rejects.toMatchObject({ status: 400 });
  expect(db.hotelGuestAccount.update).not.toHaveBeenCalled();
});

test('changes a central account password', async () => {
  const central = { ...guest, centralPasswordHash: await bcrypt.hash('oldpass1', 4) };
  const result = await changeGuestPassword(central, null, { currentPassword: 'oldpass1', newPassword: 'newpass22' });
  const update = db.platformGuest.update.mock.calls[0][0] as any;
  expect(await bcrypt.compare('newpass22', update.data.centralPasswordHash)).toBe(true);
  expect(jwt.verify(result.token, 'test-secret')).toMatchObject({ type: 'central_guest', platformGuestId: 7 });
});

test.each([['', 'newpass22'], ['oldpass1', '12345'], ['oldpass1', '1234567890123456'], ['oldpass1', 'oldpass1']])('rejects invalid passwords (%s → %s)', async (currentPassword, newPassword) => {
  await expect(changeGuestPassword(guest, 3, { currentPassword, newPassword })).rejects.toMatchObject({ status: 400 });
});
