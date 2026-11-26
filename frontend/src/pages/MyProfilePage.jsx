import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Mail, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { changeMyPassword, getMe, requestStaffPasswordReset } from '../api/auth';
import { useAuthStore } from '../store/authStore';

const card = 'space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm';
const input = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const when = (value) => (value ? new Date(value).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function Row({ label, value }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2.5 last:border-0">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="break-all text-sm font-semibold text-text">{value || '—'}</dd>
    </div>
  );
}

export default function MyProfilePage() {
  const sessionUser = useAuthStore((state) => state.user);
  const me = useQuery({ queryKey: ['my-profile'], queryFn: async () => (await getMe()).data.data });
  const user = { ...sessionUser, ...(me.data || {}) };

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const change = useMutation({
    mutationFn: () => changeMyPassword(pw.current, pw.next),
    onSuccess: (res) => {
      const { accessToken, refreshToken } = res.data.data;
      useAuthStore.setState({ accessToken, refreshToken });
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Other devices were signed out.');
    },
    onError: (err) => setError(err.response?.data?.message || 'Could not change your password. Try again.'),
  });
  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (pw.next.length < 8) { setError('Use at least 8 characters for the new password.'); return; }
    if (pw.next !== pw.confirm) { setError('The new passwords do not match.'); return; }
    change.mutate();
  };

  const [linkSent, setLinkSent] = useState(false);
  const emailLink = useMutation({
    mutationFn: () => requestStaffPasswordReset(user.email),
    onSuccess: () => setLinkSent(true),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">My profile</h1>
        <p className="mt-1 text-sm text-text-muted">Your account details and password.</p>
      </div>

      <section className={card} aria-labelledby="profile-details">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xl font-bold text-text-inverted">{user.fullName?.charAt(0).toUpperCase() || 'U'}</span>
          <div className="min-w-0">
            <h2 id="profile-details" className="truncate text-lg font-bold text-text">{user.fullName}</h2>
            <p className="text-sm text-text-muted">{user.role}{user.propertyName ? ` · ${user.propertyName}` : ''}</p>
          </div>
        </div>
        <dl>
          <Row label="Username" value={user.username && `@${user.username}`} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={user.role} />
          <Row label="Hotel" value={user.propertyName} />
          <Row label="Last sign-in" value={when(user.lastLoginAt)} />
          <Row label="Account created" value={when(user.createdAt)} />
        </dl>
        <p className="flex items-start gap-2 text-xs text-text-muted"><UserRound size={14} className="mt-0.5 shrink-0" /> {user.role === 'Manager' ? 'Staff names, emails and roles are managed in Staff Management.' : 'To change your name, email or role, ask your hotel manager.'}</p>
      </section>

      <form onSubmit={submit} className={card} aria-labelledby="change-password">
        <h2 id="change-password" className="flex items-center gap-2 font-bold text-text"><KeyRound size={18} className="text-primary-600" /> Change password</h2>
        <label className="block text-sm font-medium text-text">Current password
          <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={input} />
        </label>
        <label className="block text-sm font-medium text-text">New password <span className="font-normal text-text-muted">(at least 8 characters)</span>
          <input type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} />
        </label>
        <label className="block text-sm font-medium text-text">Confirm new password
          <input type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={input} />
        </label>
        <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
          {show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? 'Hide passwords' : 'Show passwords'}
        </button>
        {error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
        <button disabled={change.isPending} className="w-full rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:opacity-60 sm:w-auto">
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
        <p className="text-xs text-text-muted">After changing it, you stay signed in here and are signed out on your other devices.</p>
      </form>

      <section className={card} aria-labelledby="forgot-current">
        <h2 id="forgot-current" className="flex items-center gap-2 font-bold text-text"><Mail size={18} className="text-primary-600" /> Forgot your current password?</h2>
        {user.email ? (
          linkSent
            ? <p role="status" className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">A reset link was sent to {user.email}. It expires in 30 minutes.</p>
            : <>
                <p className="text-sm text-text-muted">We can email a link to <strong className="text-text">{user.email}</strong> so you can set a new password without the old one.</p>
                <button type="button" onClick={() => emailLink.mutate()} disabled={emailLink.isPending} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60">
                  {emailLink.isPending ? 'Sending…' : 'Email me a reset link'}
                </button>
              </>
        ) : <p className="text-sm text-text-muted">Your account has no email address. Ask your hotel manager to reset your password.</p>}
      </section>
    </div>
  );
}
