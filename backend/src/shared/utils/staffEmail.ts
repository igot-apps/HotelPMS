// Replace this adapter with provider delivery when email is configured.
export async function deliverStaffInvitation(email: string, token: string) {
  if (process.env.NODE_ENV === 'production' && process.env.STAFF_EMAIL_MODE !== 'simulation') {
    throw new Error('Staff email delivery is not configured.');
  }
  const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
  const setupUrl = `${origin.replace(/\/$/, '')}/staff/setup#${token}`;
  return { mode: 'simulation', to: email, subject: 'Set up your hotel staff account', setupUrl };
}
