import webpush from 'web-push';
import { prisma } from '../../shared/utils/prisma';
import { atProperty } from '../../shared/utils/property-access';

/**
 * Web Push for hotel staff devices (installed iPhone app, Android, desktop browsers).
 * Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT; without them push is simply off.
 * Sending never throws: a failed notification must never break the booking/payment that caused it.
 */
export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type StaffRole = 'Manager' | 'Receptionist' | 'Housekeeper';

let configured: boolean | null = null;
export function pushConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@hideout24.com';
  configured = Boolean(publicKey && privateKey);
  if (configured) webpush.setVapidDetails(subject, publicKey!, privateKey!);
  return configured;
}
export const pushPublicKey = () => (pushConfigured() ? process.env.VAPID_PUBLIC_KEY!.trim() : null);

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Save (or move to this user) the device subscription the browser gave us. */
export async function saveSubscription(userId: number, input: any, userAgent?: string) {
  const endpoint = clean(input?.endpoint, 2000);
  const p256dh = clean(input?.keys?.p256dh, 200);
  const auth = clean(input?.keys?.auth, 100);
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw Object.assign(new Error('Invalid notification subscription.'), { statusCode: 400 });
  const user = await prisma.user.findUnique({ where: { userId }, select: { isActive: true, isPlatformAdmin: true, propertyId: true } });
  if (!user?.isActive || user.isPlatformAdmin || !user.propertyId) throw Object.assign(new Error('Only hotel staff can turn on notifications.'), { statusCode: 403 });
  // One device = one subscription: if someone else used this device before, it now belongs to this user.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth, userAgent: clean(userAgent, 300) || null },
    update: { userId, p256dh, auth, userAgent: clean(userAgent, 300) || null },
  });
}

/** Stop notifications on one device (on sign-out or when switched off). Only the owner can remove it. */
export async function removeSubscription(userId: number, endpoint: unknown) {
  const value = clean(endpoint, 2000);
  if (!value) return;
  await prisma.pushSubscription.deleteMany({ where: { endpoint: value, userId } });
}

async function deliver(subscriptions: { subscriptionId: number; endpoint: string; p256dh: string; auth: string }[], payload: PushPayload) {
  const body = JSON.stringify({ ...payload, url: payload.url || '/dashboard' });
  let sent = 0;
  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 6 * 3600, urgency: 'high' });
      sent += 1;
      await prisma.pushSubscription.update({ where: { subscriptionId: sub.subscriptionId }, data: { lastSuccessAt: new Date() } }).catch(() => {});
    } catch (error: any) {
      // 404/410: the device unsubscribed or the app was removed. Forget it.
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { subscriptionId: sub.subscriptionId } }).catch(() => {});
      } else {
        console.warn('Push notification was not delivered', { subscriptionId: sub.subscriptionId, status: error?.statusCode });
      }
    }
  }));
  return sent;
}

/** Record a one-time key; false when it was already sent (so the notification is skipped). */
async function firstTime(key: string) {
  try {
    await prisma.pushNotice.create({ data: { key: key.slice(0, 200) } });
    return true;
  } catch (error: any) {
    if (error?.code === 'P2002') return false;
    throw error;
  }
}

/**
 * Notify active staff of a hotel who hold one of `roles` and turned notifications on.
 * `excludeUserId`: the person who did the action (they already know). `onceKey`: send at most once ever.
 */
export async function notifyStaff(propertyId: number, roles: StaffRole[], payload: PushPayload, options: { excludeUserId?: number; onceKey?: string } = {}) {
  try {
    if (!pushConfigured() || !propertyId || !roles.length) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        user: {
          isActive: true, invitationPending: false, isPlatformAdmin: false,
          role: { roleName: { in: roles } },
          ...atProperty(propertyId),
          ...(options.excludeUserId ? { NOT: { userId: options.excludeUserId } } : {}),
        },
      },
      select: { subscriptionId: true, endpoint: true, p256dh: true, auth: true },
    });
    if (!subscriptions.length) return 0;
    if (options.onceKey && !(await firstTime(options.onceKey))) return 0;
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { propertyName: true } });
    const title = property?.propertyName ? `${payload.title} · ${property.propertyName}` : payload.title;
    return await deliver(subscriptions, { ...payload, title });
  } catch (error) {
    console.warn('Could not send push notifications', { propertyId, error: error instanceof Error ? error.message : error });
    return 0;
  }
}

/** "Send a test" from My profile: only this user's devices. */
export async function notifyUser(userId: number, payload: PushPayload) {
  if (!pushConfigured()) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId }, select: { subscriptionId: true, endpoint: true, p256dh: true, auth: true } });
  return deliver(subscriptions, payload);
}

/** Fire-and-forget helper for request handlers. */
export const notifyStaffLater = (...args: Parameters<typeof notifyStaff>) => { void notifyStaff(...args); };
