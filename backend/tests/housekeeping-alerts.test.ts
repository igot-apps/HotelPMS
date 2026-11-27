import { beforeEach, expect, jest, test } from '@jest/globals';
import webpush from 'web-push';
import { prisma } from '../src/shared/utils/prisma';

jest.mock('web-push', () => ({ __esModule: true, default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() } }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {
  pushSubscription: { findMany: jest.fn(), update: jest.fn<any>().mockResolvedValue({}), deleteMany: jest.fn<any>().mockResolvedValue({}) },
  pushNotice: { create: jest.fn() },
  property: { findUnique: jest.fn(), findMany: jest.fn() },
  room: { findMany: jest.fn(), findFirst: jest.fn() },
  reservationRoom: { findMany: jest.fn(), count: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
} }));

const db = prisma as any;
const send = (webpush as any).sendNotification;
const device = (id: number, notificationPreferences: unknown = null) => ({ subscriptionId: id, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a', user: { notificationPreferences } });
const sentTitles = () => send.mock.calls.map((call: any[]) => JSON.parse(call[1]).title);

function load() {
  let mod: typeof import('../src/modules/notifications/housekeeping-alerts');
  jest.isolateModules(() => { mod = require('../src/modules/notifications/housekeeping-alerts'); });
  return mod!;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = 'public';
  process.env.VAPID_PRIVATE_KEY = 'private';
  db.property.findUnique.mockResolvedValue({ propertyName: 'OB-hotel' });
  db.pushSubscription.findMany.mockResolvedValue([device(1)]);
  db.pushNotice.create.mockResolvedValue({});
  db.reservationRoom.findMany.mockResolvedValue([]);
  db.reservationRoom.count.mockResolvedValue(0);
  send.mockResolvedValue({});
});

test('alerts are on unless switched off', () => {
  const { wantsAlert } = load();
  expect(wantsAlert(null, 'urgentCleaning')).toBe(true);
  expect(wantsAlert({ checkinSummary: false }, 'urgentCleaning')).toBe(true);
  expect(wantsAlert({ urgentCleaning: false }, 'urgentCleaning')).toBe(false);
});

test('checkout: housekeepers who switched "Room needs cleaning" off are skipped', async () => {
  db.room.findMany.mockResolvedValue([{ roomId: 7, roomNumber: '104', propertyId: 5, property: { timezone: 'Africa/Accra', checkInTime: '14:00' } }]);
  db.pushSubscription.findMany.mockResolvedValue([device(1), device(2, { roomNeedsCleaning: false })]);
  await load().notifyRoomsNeedCleaning([7]);
  expect(db.pushSubscription.findMany.mock.calls[0][0].where.user.role).toEqual({ roleName: { in: ['Housekeeper'] } });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].endpoint).toBe('https://push.example/1');
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: 'Room needs cleaning · OB-hotel', body: 'Room 104: the guest has checked out.', url: '/housekeeping' });
});

test('checkout of a room with a guest arriving today is sent as urgent, once per room per day', async () => {
  db.room.findMany.mockResolvedValue([{ roomId: 7, roomNumber: '104', propertyId: 5, property: { timezone: 'Africa/Accra', checkInTime: '14:00' } }]);
  db.reservationRoom.findMany.mockResolvedValue([{ roomId: 7 }]);
  await load().notifyRoomsNeedCleaning([7], new Date('2026-11-27T10:00:00Z'));
  expect(sentTitles()).toEqual(['Urgent cleaning · OB-hotel']);
  expect(JSON.parse(send.mock.calls[0][1]).body).toContain('from 2:00 PM');
  expect(db.pushNotice.create).toHaveBeenCalledWith({ data: { key: 'urgent-clean:7:2026-11-27' } });
});

test('no notification when housekeeping is off or the room is no longer waiting', async () => {
  db.room.findMany.mockResolvedValue([]);
  await load().notifyRoomsNeedCleaning([7]);
  expect(db.room.findMany.mock.calls[0][0].where).toMatchObject({ operationalStatus: 'Available', housekeepingStatus: 'Dirty', property: { housekeepingEnabled: true } });
  expect(send).not.toHaveBeenCalled();
});

test('morning check waits until 7 AM hotel time, then sends urgent rooms and the day summaries', async () => {
  db.property.findMany.mockResolvedValue([{ propertyId: 5, timezone: 'Africa/Accra', checkInTime: '14:00', checkOutTime: '11:00' }]);
  db.room.findMany.mockResolvedValue([{ roomId: 7, roomNumber: '104', propertyId: 5 }, { roomId: 8, roomNumber: '105', propertyId: 5 }]);
  db.reservationRoom.findMany.mockResolvedValue([{ roomId: 7 }]);
  db.reservationRoom.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
  const { runHousekeepingAlerts } = load();
  await runHousekeepingAlerts(new Date('2026-11-27T06:30:00Z'));
  expect(send).not.toHaveBeenCalled();
  await runHousekeepingAlerts(new Date('2026-11-27T07:05:00Z'));
  expect(sentTitles()).toEqual(['Urgent cleaning · OB-hotel', 'Checkouts today · OB-hotel']);
  expect(JSON.parse(send.mock.calls[1][1]).body).toBe('3 rooms are expected to check out today by 11:00 AM.');
  expect(db.pushNotice.create.mock.calls.map((call: any[]) => call[0].data.key)).toEqual(['urgent-clean:7:2026-11-27', 'hk-checkouts:5:2026-11-27']);
});

test('maintenance resolved tells housekeepers when the room needs cleaning', async () => {
  db.room.findFirst.mockResolvedValue({ roomId: 7, roomNumber: '104', propertyId: 5, housekeepingStatus: 'Dirty' });
  await load().notifyMaintenanceResolved(7);
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: 'Maintenance resolved · OB-hotel', body: 'Room 104 is back in service and needs cleaning.' });
});

test('housekeepers save choices; other roles have none and bad input is refused', async () => {
  const { setAlertPreference, getAlertPreferences } = load();
  db.user.findUnique.mockResolvedValue({ notificationPreferences: { checkinSummary: false, junk: false }, role: { roleName: 'Housekeeper' } });
  db.user.update.mockResolvedValue({});
  await setAlertPreference(9, 'urgentCleaning', false);
  expect(db.user.update).toHaveBeenCalledWith({ where: { userId: 9 }, data: { notificationPreferences: { checkinSummary: false, urgentCleaning: false } } });
  await setAlertPreference(9, 'checkinSummary', true);
  expect(db.user.update.mock.calls[1][0].data.notificationPreferences).toEqual({});
  await expect(setAlertPreference(9, 'payments', false)).rejects.toMatchObject({ statusCode: 400 });
  db.user.findUnique.mockResolvedValue({ notificationPreferences: null, role: { roleName: 'Receptionist' } });
  await expect(setAlertPreference(9, 'urgentCleaning', false)).rejects.toMatchObject({ statusCode: 403 });
  await expect(getAlertPreferences(9)).resolves.toEqual([]);
});
