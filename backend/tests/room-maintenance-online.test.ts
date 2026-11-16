import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db = {
  user: { findFirst: mock(), update: mock() },
  room: { findFirst: mock(), update: mock() },
  auditLog: { create: mock() },
  $transaction: mock(),
};
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));

import { maintenanceReasonUpdate } from '../src/modules/room/room.service';
import { canManageOnlineRooms, setOnlineRoomPermission, setRoomOnlineBooking } from '../src/modules/room/room-online.service';

const actor = { userId: 1, propertyId: 3 };
const staff = (roleName: string, canManage = false) => ({ userId: 1, propertyId: 3, isActive: true, canManageOnlineRooms: canManage, role: { roleName } });

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (operations: any[]) => Promise.all(operations));
  db.room.update.mockImplementation(async ({ data }: any) => ({ roomId: 10, roomNumber: '102', ...data }));
});

test('requires a reason when a room enters maintenance', () => {
  expect(() => maintenanceReasonUpdate('Available', 'Maintenance', undefined)).toThrow('maintenance reason');
  expect(() => maintenanceReasonUpdate('Available', 'Maintenance', ' ab ')).toThrow();
  expect(maintenanceReasonUpdate('Available', 'Maintenance', '  Plumbing   repair ')).toEqual({ maintenanceReason: 'Plumbing repair' });
});

test('keeps the reason while already in maintenance and clears it when leaving', () => {
  expect(maintenanceReasonUpdate('Maintenance', 'Maintenance', undefined)).toEqual({});
  expect(maintenanceReasonUpdate('Maintenance', 'Available', undefined)).toEqual({ maintenanceReason: null });
  expect(maintenanceReasonUpdate('Available', 'Occupied', undefined)).toEqual({});
});

test.each([
  ['Manager', false, true],
  ['Receptionist', true, true],
  ['Receptionist', false, false],
  ['Housekeeper', true, false],
])('%s (granted=%s) can manage online rooms: %s', (role, granted, expected) => {
  expect(canManageOnlineRooms({ canManageOnlineRooms: granted as boolean, role: { roleName: role as string } })).toBe(expected);
});

test('a manager hides a room from online booking without a reason and it is audited', async () => {
  db.user.findFirst.mockResolvedValue(staff('Manager'));
  db.room.findFirst.mockResolvedValue({ roomId: 10, roomNumber: '102', isOnlineBookable: true });
  await expect(setRoomOnlineBooking(actor, 10, false)).resolves.toMatchObject({ isOnlineBookable: false });
  expect(db.room.update).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: 10 }, data: { isOnlineBookable: false } }));
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RoomHiddenOnline', entityId: 10 }) }));
});

test('a receptionist without permission cannot hide a room', async () => {
  db.user.findFirst.mockResolvedValue(staff('Receptionist'));
  await expect(setRoomOnlineBooking(actor, 10, false)).rejects.toMatchObject({ statusCode: 403 });
  expect(db.room.update).not.toHaveBeenCalled();
});

test('only a manager can grant the permission, and only to a receptionist', async () => {
  db.user.findFirst.mockResolvedValueOnce(staff('Receptionist', true));
  await expect(setOnlineRoomPermission(actor, 5, true)).rejects.toMatchObject({ statusCode: 403 });

  db.user.findFirst.mockResolvedValueOnce(staff('Manager')).mockResolvedValueOnce({ userId: 5, canManageOnlineRooms: false, role: { roleName: 'Housekeeper' } });
  await expect(setOnlineRoomPermission(actor, 5, true)).rejects.toThrow('receptionist');

  db.user.findFirst.mockResolvedValueOnce(staff('Manager')).mockResolvedValueOnce({ userId: 5, canManageOnlineRooms: false, role: { roleName: 'Receptionist' } });
  await expect(setOnlineRoomPermission(actor, 5, true)).resolves.toEqual({ userId: 5, canManageOnlineRooms: true });
  expect(db.user.update).toHaveBeenCalledWith({ where: { userId: 5 }, data: { canManageOnlineRooms: true } });
});
