import { getFrontendBaseUrl } from './frontend-url';

// Replace this adapter with provider delivery when email is configured.
export async function deliverStaffInvitation(email: string, token: string) {
  if (process.env.NODE_ENV === 'production' && process.env.STAFF_EMAIL_MODE !== 'simulation') {
    throw new Error('Staff email delivery is not configured.');
  }
  const setupUrl = `${getFrontendBaseUrl()}/staff/setup#${token}`;
  return { mode: 'simulation', to: email, subject: 'Set up your hotel staff account', setupUrl };
}
