import { Resend } from 'resend';
import { prisma } from '../../shared/utils/prisma';
import { getFrontendBaseUrl } from '../../shared/utils/frontend-url';
import { getSubscriptionState, subscriptionFields } from './subscription-state';

const day = 86400000;
let checking = false;

export async function sendSubscriptionReminders(now = new Date()) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (checking || process.env.NODE_ENV !== 'production' || process.env.STAFF_EMAIL_MODE === 'simulation'
    || !key || !from || /@resend\.dev\b/i.test(from)) return;

  checking = true;
  try {
    const dates = { gt: new Date(now.getTime() - day), lte: new Date(now.getTime() + 3 * day) };
    const properties = await prisma.property.findMany({
      where: { isActive: true, status: 'Active', OR: [{ trialEndsAt: dates }, { subscriptionEndsAt: dates }] },
      select: {
        ...subscriptionFields, propertyId: true, propertyName: true,
        subscriptionReminderFor: true, subscriptionExpiryNoticeFor: true,
        users: {
          where: { isActive: true, invitationPending: false, email: { not: null }, role: { roleName: 'Manager' } },
          orderBy: { userId: 'asc' }, take: 1, select: { email: true },
        },
      },
    });
    const resend = new Resend(key);
    for (const property of properties) {
      const { expired, cancelled, endsAt } = getSubscriptionState(property, now);
      const recipient = property.users[0]?.email?.trim();
      if (cancelled || !endsAt || !recipient) continue;
      const remaining = endsAt.getTime() - now.getTime();
      const expiryNotice = expired && remaining <= 0 && remaining > -day;
      const advanceNotice = !expired && remaining > 2 * day && remaining <= 3 * day;
      if (!expiryNotice && !advanceNotice) continue;
      const field = expiryNotice ? 'subscriptionExpiryNoticeFor' : 'subscriptionReminderFor';
      if (property[field]?.getTime() === endsAt.getTime()) continue;

      const date = new Intl.DateTimeFormat('en-GH', { timeZone: 'Africa/Accra', dateStyle: 'long' }).format(endsAt);
      const subject = expiryNotice ? 'Your HideOut24 plan has expired' : 'Your HideOut24 plan expires soon';
      const message = expiryNotice
        ? `The HideOut24 plan for ${property.propertyName} expired on ${date}. New online bookings are paused.`
        : `The HideOut24 plan for ${property.propertyName} expires on ${date}. Renew to keep online bookings open.`;
      try {
        const result = await resend.emails.send({
          from, to: recipient, subject, text: `${message}\n\nRenew your plan: ${getFrontendBaseUrl()}/billing`,
        }, { idempotencyKey: `subscription/${property.propertyId}/${endsAt.getTime()}/${field}` });
        if (result.error || !result.data?.id) throw new Error('Reminder was not accepted');
        await prisma.property.update({ where: { propertyId: property.propertyId }, data: { [field]: endsAt } });
      } catch {
        console.warn('Could not send or record subscription reminder', { propertyId: property.propertyId, expiryNotice });
      }
    }
  } finally {
    checking = false;
  }
}
