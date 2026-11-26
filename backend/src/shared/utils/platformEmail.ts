// Emails for Super Admin (platform administrator) accounts, sent through Resend.
// Separate from staffEmail.ts so hotel staff messages and links are unchanged.
import { Resend } from 'resend';
import { getFrontendBaseUrl } from './frontend-url';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function send(to: string, subject: string, text: string, html: string, link?: string) {
  if (process.env.STAFF_EMAIL_MODE === 'simulation') {
    // Links are printed only outside production, so local testing works without Resend.
    if (process.env.NODE_ENV !== 'production' && link) console.info('[platform email simulation]', { to, subject, link });
    else console.info('[platform email simulation]', { to, subject });
    return;
  }
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from || (process.env.NODE_ENV === 'production' && /@resend\.dev\b/i.test(from))) {
    throw new Error('Platform email delivery is not configured.');
  }
  const { data, error } = await new Resend(key).emails.send({ from, to: [to], subject, text, html });
  if (error || !data?.id) throw new Error('Platform email was not accepted.');
  console.info('Platform admin email accepted by Resend', { emailId: data.id, subject });
}

export const platformLink = (path: string, token: string) => `${getFrontendBaseUrl()}/superadmin/${path}#${token}`;

export async function deliverPlatformInvitation(email: string, token: string) {
  const url = platformLink('setup', token);
  await send(email, 'You have been invited as a HideOut24 platform administrator',
    `You have been invited to administer the HideOut24 platform. Open this link to set your password:\n\n${url}\n\nThe link expires in 24 hours and can be used once. If you were not expecting this, ignore this email.`,
    `<p>You have been invited to administer the HideOut24 platform.</p><p><a href="${url}">Set your password</a></p><p>The link expires in 24 hours and can be used once. If you were not expecting this, ignore this email.</p>`, url);
}

export async function deliverPlatformPasswordReset(email: string, token: string) {
  const url = platformLink('reset-password', token);
  await send(email, 'Reset your HideOut24 platform administrator password',
    `To reset your platform administrator password, open this link:\n\n${url}\n\nThe link expires in 30 minutes and can be used once. If you did not request this, ignore this email and consider changing your password.`,
    `<p>To reset your platform administrator password, <a href="${url}">open this secure link</a>.</p><p>The link expires in 30 minutes and can be used once. If you did not request this, ignore this email and consider changing your password.</p>`, url);
}

export async function deliverPlatformEmailChange(email: string, token: string) {
  const url = platformLink('verify-email', token);
  await send(email, 'Confirm your new HideOut24 administrator email',
    `Confirm this address for your HideOut24 platform administrator account:\n\n${url}\n\nThe link expires in 1 hour. If you did not request this, ignore this email.`,
    `<p>Confirm this address for your HideOut24 platform administrator account.</p><p><a href="${url}">Confirm email address</a></p><p>The link expires in 1 hour. If you did not request this, ignore this email.</p>`, url);
}

export async function deliverPlatformEmailChangedNotice(oldEmail: string, newEmail: string) {
  await send(oldEmail, 'Your HideOut24 administrator email was changed',
    `The sign-in email for your HideOut24 platform administrator account was changed to ${newEmail}. If you did not do this, contact another administrator immediately.`,
    `<p>The sign-in email for your HideOut24 platform administrator account was changed to <strong>${escapeHtml(newEmail)}</strong>.</p><p>If you did not do this, contact another administrator immediately.</p>`);
}
