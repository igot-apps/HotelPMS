import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { changeMyPlatformPassword, getMyPlatformAccount, requestMyPlatformEmailChange, updateMyPlatformName } from '../api/platformAdmins';
import { usePlatformAuthStore } from '../store/platformAuthStore';

const input = 'mt-1 w-full rounded-lg border border-border bg-background p-2.5';
const card = 'space-y-3 rounded-xl border border-border bg-surface p-5';
const button = 'rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50';
const message = (error, fallback) => error?.response?.data?.message || fallback;

export default function PlatformAccountPage() {
  const queryClient = useQueryClient();
  const { setTokens, updateUser } = usePlatformAuthStore();
  const me = useQuery({ queryKey: ['platform-me'], queryFn: async () => (await getMyPlatformAccount()).data.data });
  const [name, setName] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [em, setEm] = useState({ current: '', email: '' });
  const [pwError, setPwError] = useState('');
  const [emError, setEmError] = useState('');
  const [emailSentTo, setEmailSentTo] = useState('');

  const saveName = useMutation({
    mutationFn: () => updateMyPlatformName(name),
    onSuccess: () => { updateUser({ fullName: name.trim() }); setName(null); queryClient.invalidateQueries({ queryKey: ['platform-me'] }); toast.success('Name updated.'); },
  });
  const changePassword = useMutation({
    mutationFn: () => changeMyPlatformPassword(pw.current, pw.next),
    onSuccess: (res) => { setTokens(res.data.data); setPw({ current: '', next: '', confirm: '' }); toast.success('Password changed. Your other sessions were signed out.'); },
    onError: (error) => setPwError(message(error, 'Could not change your password.')),
  });
  const changeEmail = useMutation({
    mutationFn: () => requestMyPlatformEmailChange(em.current, em.email),
    onSuccess: () => { setEmailSentTo(em.email.trim()); setEm({ current: '', email: '' }); },
    onError: (error) => setEmError(message(error, 'Could not start the email change.')),
  });

  if (me.isLoading) return <p className="text-text-muted">Loading…</p>;
  const account = me.data || {};

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">My account</h1>

      <form className={card} onSubmit={(e) => { e.preventDefault(); saveName.mutate(); }}>
        <h2 className="font-semibold">Name</h2>
        <label className="block text-sm font-medium">Full name<input required minLength={2} maxLength={200} value={name ?? account.fullName ?? ''} onChange={(e) => setName(e.target.value)} className={input} /></label>
        <button disabled={name === null || saveName.isPending} className={button}>Save name</button>
      </form>

      {account.isDefault ? (
        <section className={card}>
          <h2 className="font-semibold">Sign-in email</h2>
          <p className="text-sm text-text-muted"><strong>{account.email}</strong> is the default administrator. It cannot be deactivated and its email cannot be changed. If you lose access, use “Forgot your password?” on the sign-in page.</p>
        </section>
      ) : <form className={card} onSubmit={(e) => {
        e.preventDefault(); setEmError('');
        changeEmail.mutate();
      }}>
        <h2 className="font-semibold">Sign-in email</h2>
        <p className="text-sm text-text-muted">Current: <strong>{account.email || 'none — you sign in with your phone number'}</strong>. The new address takes effect only after you open the confirmation link sent to it; you will then be signed out everywhere and sign in with the new email.</p>
        {emailSentTo && <p role="status" className="rounded-lg bg-success-50 p-3 text-sm text-success-700">Confirmation link sent to {emailSentTo}. It expires in 1 hour.</p>}
        <label className="block text-sm font-medium">New email<input required type="email" maxLength={200} value={em.email} onChange={(e) => setEm({ ...em, email: e.target.value })} className={input} /></label>
        <label className="block text-sm font-medium">Current password<input required type="password" autoComplete="current-password" value={em.current} onChange={(e) => setEm({ ...em, current: e.target.value })} className={input} /></label>
        {emError && <p role="alert" className="text-sm text-danger-600">{emError}</p>}
        <button disabled={changeEmail.isPending} className={button}>{changeEmail.isPending ? 'Sending…' : 'Send confirmation link'}</button>
      </form>}

      <form className={card} onSubmit={(e) => {
        e.preventDefault(); setPwError('');
        if (pw.next !== pw.confirm) { setPwError('New passwords do not match.'); return; }
        changePassword.mutate();
      }}>
        <h2 className="font-semibold">Password</h2>
        <label className="block text-sm font-medium">Current password<input required type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={input} /></label>
        <label className="block text-sm font-medium">New password (at least 12 characters)<input required minLength={12} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} /></label>
        <label className="block text-sm font-medium">Confirm new password<input required minLength={12} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={input} /></label>
        {pwError && <p role="alert" className="text-sm text-danger-600">{pwError}</p>}
        <button disabled={changePassword.isPending} className={button}>{changePassword.isPending ? 'Saving…' : 'Change password'}</button>
      </form>
    </div>
  );
}
