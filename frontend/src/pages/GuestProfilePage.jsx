import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Loader2, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/axios';
import PublicNavbar from '../components/public/PublicNavbar';

const field = 'mt-1.5 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:opacity-60';

function saveGuestSession(guest, token) {
  try {
    const current = JSON.parse(localStorage.getItem('guestInfo') || '{}');
    localStorage.setItem('guestInfo', JSON.stringify({ ...current, ...guest }));
    if (token) localStorage.setItem('guestToken', token);
  } catch { /* storage unavailable: the page still shows the saved values */ }
  window.dispatchEvent(new Event('guest-session-changed'));
}

export default function GuestProfilePage() {
  const profile = useQuery({ queryKey: ['guestProfile'], queryFn: async () => (await api.get('/public/profile')).data.data });
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.fullName || '');
    setPhone(profile.data.phone || '');
  }, [profile.data]);

  const saveProfile = useMutation({
    mutationFn: async () => (await api.patch('/public/profile', { fullName, phone })).data.data,
    onSuccess: (data) => {
      profile.refetch();
      saveGuestSession({ fullName: data.fullName, phone: data.phone });
      toast.success('Profile updated.');
    },
  });

  const changePassword = useMutation({
    mutationFn: async () => (await api.post('/public/profile/password', { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword })).data.data,
    onSuccess: (data) => {
      saveGuestSession(data.guest, data.token);
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed.');
    },
  });

  const phoneValid = /^0\d{9}$/.test(phone);
  const profileChanged = profile.data && (fullName.trim() !== profile.data.fullName || phone !== profile.data.phone);
  const passwordMismatch = passwords.confirmPassword && passwords.newPassword !== passwords.confirmPassword;
  const passwordReady = passwords.currentPassword && passwords.newPassword.length >= 6 && passwords.newPassword.length <= 15 && passwords.newPassword === passwords.confirmPassword;
  const setPassword = (key) => (event) => setPasswords((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-text">My profile</h1>
          <p className="mt-1 text-sm text-text-muted">Keep your contact details up to date so the hotel can reach you about your bookings.</p>
        </header>

        {profile.isLoading ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-text-muted">Loading your profile…</p>
        ) : profile.isError ? (
          <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-6 text-sm text-danger-700">Could not load your profile. Please sign in again.</p>
        ) : (
          <>
            <form
              onSubmit={(event) => { event.preventDefault(); if (!saveProfile.isPending && profileChanged && phoneValid) saveProfile.mutate(); }}
              className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
            >
              <h2 className="flex items-center gap-2 text-lg font-bold text-text"><UserRound size={19} className="text-primary-600" /> Personal details</h2>
              <label className="block text-sm font-medium text-text">Full name
                <input required maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={saveProfile.isPending} className={field} />
              </label>
              <label className="block text-sm font-medium text-text">Phone number
                <input required type="tel" inputMode="numeric" maxLength={10} placeholder="0241234567" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} disabled={saveProfile.isPending} className={field} />
              </label>
              {phone && !phoneValid && <p className="text-sm text-danger-700">Enter a 10-digit Ghana number starting with 0.</p>}
              <label className="block text-sm font-medium text-text">Email
                <input value={profile.data.email || ''} disabled className={field} />
                <span className="mt-1 block text-xs text-text-muted">Your email is used to sign in and can't be changed here.</span>
              </label>
              <button disabled={saveProfile.isPending || !profileChanged || !phoneValid || fullName.trim().length < 2} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
                {saveProfile.isPending && <Loader2 size={16} className="animate-spin" />} Save changes
              </button>
            </form>

            <form
              onSubmit={(event) => { event.preventDefault(); if (!changePassword.isPending && passwordReady) changePassword.mutate(); }}
              className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6"
            >
              <h2 className="flex items-center gap-2 text-lg font-bold text-text"><KeyRound size={19} className="text-primary-600" /> Change password</h2>
              <label className="block text-sm font-medium text-text">Current password
                <input required type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={setPassword('currentPassword')} disabled={changePassword.isPending} className={field} />
              </label>
              <label className="block text-sm font-medium text-text">New password
                <input required type="password" autoComplete="new-password" minLength={6} maxLength={15} value={passwords.newPassword} onChange={setPassword('newPassword')} disabled={changePassword.isPending} className={field} />
                <span className="mt-1 block text-xs text-text-muted">6 to 15 characters.</span>
              </label>
              <label className="block text-sm font-medium text-text">Confirm new password
                <input required type="password" autoComplete="new-password" maxLength={15} value={passwords.confirmPassword} onChange={setPassword('confirmPassword')} disabled={changePassword.isPending} className={field} />
              </label>
              {passwordMismatch && <p className="text-sm text-danger-700">The new passwords don't match.</p>}
              <button disabled={changePassword.isPending || !passwordReady} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
                {changePassword.isPending && <Loader2 size={16} className="animate-spin" />} Change password
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
