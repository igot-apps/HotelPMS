import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../components/ui/BrandMark';
import { acceptPlatformInvite, requestPlatformPasswordReset, resetPlatformPassword, verifyPlatformEmail } from '../api/platformAdmins';
import { usePlatformAuthStore } from '../store/platformAuthStore';

// One page for Super Admin email links: invitation setup, password reset (and the
// "forgot password" request form) and new-email verification. Tokens stay in the #fragment.
const COPY = {
  setup: { title: 'Set up your administrator account', intro: 'Choose a password for your HideOut24 platform administrator account.', button: 'Create password', done: 'Your account is ready. Sign in with your email and new password.' },
  reset: { title: 'Set a new password', intro: 'Enter a new password for your administrator account.', button: 'Set new password', done: 'Your password has been changed and all sessions were signed out. Sign in with your new password.' },
  forgot: { title: 'Forgot your password?', intro: 'Enter your administrator email. If an active account uses it, we’ll send a reset link (valid 30 minutes).', button: 'Send reset link', done: 'If an active administrator account uses this email, a reset link is on its way. Check your inbox and spam folder.' },
  verify: { title: 'Confirm your new email', done: 'Your email is confirmed. Sign in again with your new email.' },
};

export default function PlatformAccountLinkPage({ mode }) {
  const [token] = useState(() => window.location.hash.slice(1));
  const kind = mode === 'reset' && !token ? 'forgot' : mode;
  const copy = COPY[kind];
  const logout = usePlatformAuthStore((state) => state.logout);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const verifying = useRef(false);

  const finish = () => { window.history.replaceState(null, '', window.location.pathname); setPassword(''); setConfirm(''); setDone(true); };

  useEffect(() => {
    if (kind !== 'verify' || verifying.current) return;
    verifying.current = true;
    if (!token) { setError('This verification link is incomplete.'); return; }
    setBusy(true);
    verifyPlatformEmail(token)
      .then(() => { logout(); finish(); })
      .catch((err) => setError(err.response?.data?.message || 'Invalid or expired verification link.'))
      .finally(() => setBusy(false));
  }, [kind, token, logout]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (kind !== 'forgot') {
      if (password.length < 12) { setError('Use at least 12 characters.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
    }
    setBusy(true);
    try {
      if (kind === 'setup') await acceptPlatformInvite(token, password);
      else if (kind === 'reset') { await resetPlatformPassword(token, password); logout(); }
      else await requestPlatformPasswordReset(email.trim());
      finish();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not complete this request. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary-900 px-4 py-8 text-text">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl sm:p-8">
        <Link to="/superadmin" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><BrandMark className="h-8 w-8" /> Platform administration</Link>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        {done ? (
          <div className="mt-5 space-y-4">
            <p role="status" className="text-sm leading-6 text-text-muted">{copy.done}</p>
            <Link to="/superadmin" className="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 font-semibold text-white">Go to sign in</Link>
          </div>
        ) : kind === 'verify' ? (
          <div className="mt-5 space-y-3">
            {busy && <p className="text-sm text-text-muted">Confirming…</p>}
            {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <p className="text-sm text-text-muted">{copy.intro}</p>
            {kind === 'forgot' ? (
              <label className="block text-sm font-medium">Administrator email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
            ) : <>
              <label className="block text-sm font-medium">New password (at least 12 characters)<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
              <label className="block text-sm font-medium">Confirm password<input type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
            </>}
            {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
            <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-primary-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : copy.button}</button>
          </form>
        )}
      </section>
    </main>
  );
}
