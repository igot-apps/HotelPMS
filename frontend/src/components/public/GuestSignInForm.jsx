import { useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { startGuestSession } from '../../lib/guestSession';

export default function GuestSignInForm({ onSuccess }) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [nameSetup, setNameSetup] = useState(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/phone/request', { phone }, { skipErrorToast: true });
      setChallenge(response.data.data);
      setCode('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create a code');
    } finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/phone/verify', { challengeId: challenge.challengeId, code }, { skipErrorToast: true });
      const payload = response.data.data;
      if (payload.needsName) {
        setNameSetup(payload);
        setChallenge(null);
        return;
      }
      startGuestSession(payload.guest, payload.token);
      toast.success('Signed in');
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not verify code');
    } finally { setBusy(false); }
  }

  async function completeName(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/phone/complete', { setupToken: nameSetup.setupToken, fullName }, { skipErrorToast: true });
      const payload = response.data.data;
      startGuestSession(payload.guest, payload.token);
      toast.success('Signed in');
      onSuccess?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save your name');
    } finally { setBusy(false); }
  }

  const inputClass = 'w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
  const buttonClass = 'flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50';
  return (
    <div className="w-full min-w-0">
      <h1 className="text-2xl font-bold text-text">{nameSetup ? 'What should we call you?' : 'Sign in to book'}</h1>
      <p className="mt-1 text-sm text-text-muted">{nameSetup ? 'Add your name to finish setting up your guest account.' : 'Enter your Ghana mobile number to book or manage your reservations.'}</p>
      {nameSetup ? (
        <form onSubmit={completeName} className="mt-5 space-y-4">
          <div><label htmlFor="guest-name" className="mb-1 block text-sm font-semibold text-text">Your full name</label><input id="guest-name" className={inputClass} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} minLength={2} maxLength={200} autoFocus required /></div>
          <button className={buttonClass} disabled={busy}>{busy && <Loader2 size={18} className="animate-spin" />} Continue</button>
          <button type="button" className="w-full text-sm font-semibold text-primary-700 hover:underline" onClick={() => setNameSetup(null)}>Start again</button>
        </form>
      ) : challenge ? (
        <form onSubmit={verifyCode} className="mt-5 space-y-4">
          <p className="text-sm text-text-muted">Enter the six-digit code for {challenge.phone}.</p>
          {challenge.testCode && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center"><p className="text-xs font-semibold uppercase text-amber-800">Simulated SMS · no message sent</p><p className="mt-1 font-mono text-3xl font-bold tracking-widest text-text">{challenge.testCode}</p><p className="mt-1 text-xs text-amber-900">Use this code below to continue.</p></div>}
          <div><label htmlFor="guest-code" className="mb-1 block text-sm font-semibold text-text">Verification code</label><input id="guest-code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required /></div>
          <button className={buttonClass} disabled={busy}>{busy && <Loader2 size={18} className="animate-spin" />} Verify and continue</button>
          <button type="button" className="w-full text-sm font-semibold text-primary-700 hover:underline" onClick={() => setChallenge(null)}>Change phone number</button>
        </form>
      ) : (
        <form onSubmit={requestCode} className="mt-5 space-y-4">
          <div><label htmlFor="guest-phone" className="mb-1 block text-sm font-semibold text-text">Ghana mobile number</label><input id="guest-phone" className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" value={phone} onChange={event => setPhone(event.target.value)} required /></div>
          <button className={buttonClass} disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} />} Get code</button>
          <p className="text-center text-xs text-text-muted">For now, the code appears here instead of arriving by SMS.</p>
        </form>
      )}
    </div>
  );
}
