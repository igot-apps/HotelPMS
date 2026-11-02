import { useState } from 'react';
import { Link } from 'react-router-dom';
import { acceptStaffInvitation } from '../api/users';

export default function StaffSetupPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await acceptStaffInvitation({ token, password });
      window.history.replaceState(null, '', window.location.pathname);
      setDone(true); setPassword(''); setConfirm('');
    } catch (err) { setError(err.response?.data?.message || 'Could not set password.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <section className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-text">Set up your staff account</h1>
      {done ? <><p className="text-text">Your password is set. Sign in with the username or email your manager registered.</p><Link to="/login" className="block font-semibold text-primary-600">Continue to sign in</Link></> : !token ? <p className="text-danger-600">Invitation link is missing. Ask your manager for a new invitation.</p> : <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-text-muted">Choose your own password. Your manager will not see it.</p>
        <label className="block text-sm text-text">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
        <label className="block text-sm text-text">Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={event => setConfirm(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" /></label>
        {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-primary-600 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Set password'}</button>
      </form>}
    </section>
  </main>;
}
