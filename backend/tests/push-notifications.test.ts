import { beforeEach, expect, jest, test } from '@jest/globals';
import webpush from 'web-push';
import { prisma } from '../src/shared/utils/prisma';

jest.mock('web-push', () => ({ __esModule: true, default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() } }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {
  pushSubscription: { findMany: jest.fn(), update: jest.fn<any>().mockResolvedValue({}), deleteMany: jest.fn<any>().mockResolvedValue({}), upsert: jest.fn() },
  pushNotice: { create: jest.fn() },
  property: { findUnique: jest.fn<any>().mockResolvedValue({ propertyName: 'OB-hotel' }) },
  user: { findUnique: jest.fn() },
} }));

const db = prisma as any;
const send = (webpush as any).sendNotification;
const device = (id: number) => ({ subscriptionId: id, endpoint: `https://push.example/${id}`, p256dh: 'k', auth: 'a' });

function load() {
  let mod: typeof import('../src/modules/notifications/push.service');
  jest.isolateModules(() => { mod = require('../src/modules/notifications/push.service'); });
  return mod!;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = 'public';
  process.env.VAPID_PRIVATE_KEY = 'private';
  db.pushSubscription.findMany.mockResolvedValue([device(1), device(2)]);
  db.pushNotice.create.mockResolvedValue({});
  send.mockResolvedValue({});
});

test('sends to matching staff devices, names the hotel and skips the person who acted', async () => {
  const { notifyStaff } = load();
  const sent = await notifyStaff(5, ['Manager'], { title: 'Refund recorded', body: 'x', url: '/bookings/1' }, { excludeUserId: 9 });
  expect(sent).toBe(2);
  const where = db.pushSubscription.findMany.mock.calls[0][0].where.user;
  expect(where).toMatchObject({ isActive: true, invitationPending: false, isPlatformAdmin: false, role: { roleName: { in: ['Manager'] } }, NOT: { userId: 9 } });
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: 'Refund recorded · OB-hotel', url: '/bookings/1' });
});

test('a one-time notice is sent only once', async () => {
  const { notifyStaff } = load();
  db.pushNotice.create.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
  await notifyStaff(5, ['Receptionist'], { title: 'Guest past checkout', body: 'x' }, { onceKey: 'overstay:1' });
  await notifyStaff(5, ['Receptionist'], { title: 'Guest past checkout', body: 'x' }, { onceKey: 'overstay:1' });
  expect(send).toHaveBeenCalledTimes(2); // two devices, first call only
});

test('devices that were removed (410) are forgotten; other failures never throw', async () => {
  const { notifyStaff } = load();
  send.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 })).mockRejectedValueOnce(Object.assign(new Error('boom'), { statusCode: 500 }));
  await expect(notifyStaff(5, ['Manager'], { title: 't', body: 'b' })).resolves.toBe(0);
  expect(db.pushSubscription.deleteMany).toHaveBeenCalledTimes(1);
  expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { subscriptionId: 1 } });
});

test('without VAPID keys nothing is looked up or sent', async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  const { notifyStaff, pushPublicKey } = load();
  expect(pushPublicKey()).toBeNull();
  await expect(notifyStaff(5, ['Manager'], { title: 't', body: 'b' })).resolves.toBe(0);
  expect(db.pushSubscription.findMany).not.toHaveBeenCalled();
});

test('only active hotel staff can register a device, and bad subscriptions are refused', async () => {
  const { saveSubscription } = load();
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } };
  db.user.findUnique.mockResolvedValueOnce({ isActive: true, isPlatformAdmin: true, propertyId: null });
  await expect(saveSubscription(1, sub)).rejects.toThrow('Only hotel staff');
  await expect(saveSubscription(1, { endpoint: 'http://insecure', keys: { p256dh: 'k', auth: 'a' } })).rejects.toThrow('Invalid');
  db.user.findUnique.mockResolvedValueOnce({ isActive: true, isPlatformAdmin: false, propertyId: 2 });
  await saveSubscription(7, sub, 'iPhone');
  expect(db.pushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { endpoint: sub.endpoint }, update: expect.objectContaining({ userId: 7 }) }));
});
