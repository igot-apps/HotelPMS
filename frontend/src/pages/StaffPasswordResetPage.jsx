import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestStaffPasswordReset, resetStaffPassword } from '../api/auth';
import BrandMark from '../components/ui/BrandMark';

export default function StaffPasswordResetPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (token && password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    setError('');
    try {
      if (token) {
        await resetStaffPassword(token, password);
        window.history.replaceState(null, '', window.location.pathname);
        setPassword('');
        setConfirm('');
      } else {
        await requestStaffPasswordReset(email.trim());
      }
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not complete this request. Please try again.');
    } finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-text">
    <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8">
      <Link to="/hotel/login" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><BrandMark className="h-8 w-8" /> Hotel staff sign in</Link>
      <h1 className="text-2xl font-bold">{token ? 'Set a new password' : 'Forgot your password?'}</h1>
      {done ? <div className="mt-5 space-y-4">
        <p role="status" className="text-sm leading-6 text-text-muted">{token ? 'Your password has been changed. Sign in with your new password.' : 'If an active hotel staff account uses this email, we’ll send a reset link. Check your inbox and spam folder.'}</p>
        <Link to="/hotel/login" className="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 font-semibold text-white">Back to sign in</Link>
      </div> : <form onSubmit={submit} className="mt-5 space-y-4">
        {token ? <>
          <p className="text-sm text-text-muted">Enter a new password for your hotel staff account.</p>
          <label className="block text-sm font-medium">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
          <label className="block text-sm font-medium">Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
        </> : <>
          <p className="text-sm text-text-muted">Enter the email address on your staff account. We’ll send a reset link if the account is active.</p>
          <label className="block text-sm font-medium">Staff email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
        </>}
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-primary-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : token ? 'Set new password' : 'Send reset link'}</button>
      </form>}
    </section>
  </main>;
}
