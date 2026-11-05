import { Resend } from 'resend';
import { getFrontendBaseUrl } from './frontend-url';

export type StaffInvitationDelivery =
  | { mode: 'simulation'; to: string; subject: string; setupUrl: string }
  | { mode: 'resend'; to: string; emailId: string }
  | { mode: 'failed'; to: string; message: string };

const subject = 'Set up your hotel staff account';

export async function deliverStaffInvitation(email: string, token: string, invitationId?: string): Promise<StaffInvitationDelivery> {
  const setupUrl = `${getFrontendBaseUrl()}/staff/setup#${token}`;
  if (process.env.STAFF_EMAIL_MODE === 'simulation') {
    return { mode: 'simulation', to: email, subject, setupUrl };
  }

  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) {
    throw new Error('Staff email delivery requires RESEND_API_KEY and RESEND_FROM_EMAIL.');
  }
  if (process.env.NODE_ENV === 'production' && /@resend\.dev\b/i.test(from)) {
    throw new Error('Use a verified sending domain for production staff email.');
  }

  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: [email],
    subject,
    text: `You have been invited to join your hotel's staff account. Open this link to set your password:\n\n${setupUrl}\n\nThis link expires in 24 hours and can be used once. If you were not expecting this invitation, you can ignore this email.`,
    html: `<p>You have been invited to join your hotel's staff account.</p><p><a href="${setupUrl}">Set your password</a></p><p>This link expires in 24 hours and can be used once. If you were not expecting this invitation, you can ignore this email.</p>`,
    ...(invitationId ? { idempotencyKey: `staff-invitation/${invitationId}` } : {}),
  });
  if (error || !data?.id) {
    throw new Error(`Could not send staff invitation: ${error?.message || 'Resend returned no email ID.'}`);
  }
  console.info('Staff invitation accepted by Resend', { emailId: data.id });
  return { mode: 'resend', to: email, emailId: data.id };
}

export async function deliverStaffPasswordReset(email: string, token: string): Promise<void> {
  const resetUrl = `${getFrontendBaseUrl()}/staff/reset-password#${token}`;
  if (process.env.STAFF_EMAIL_MODE === 'simulation') {
    console.info('Staff password reset simulation requested', { to: email });
    return;
  }
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from || (process.env.NODE_ENV === 'production' && /@resend\.dev\b/i.test(from))) {
    throw new Error('Staff email delivery is not configured.');
  }
  const { data, error } = await new Resend(key).emails.send({
    from,
    to: [email],
    subject: 'Reset your hotel staff password',
    text: `To reset your hotel staff password, open this link:\n\n${resetUrl}\n\nThe link expires in 30 minutes and can be used once. If you did not request this, ignore this email.`,
    html: `<p>To reset your hotel staff password, <a href="${resetUrl}">open this secure link</a>.</p><p>The link expires in 30 minutes and can be used once. If you did not request this, ignore this email.</p>`,
  });
  if (error || !data?.id) throw new Error('Password reset email was not accepted.');
  console.info('Staff password reset accepted by Resend', { emailId: data.id });
}
