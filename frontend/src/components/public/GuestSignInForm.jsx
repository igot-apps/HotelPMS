import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Mail, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { startGuestSession } from '../../lib/guestSession';
import { useHotelWebsite } from '../../lib/hotelWebsite';

export default function GuestSignInForm({ onSuccess }) {
  const hotel = useHotelWebsite();
  const [useCode, setUseCode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [nameSetup, setNameSetup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (retrySeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setRetrySeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retrySeconds]);

  const retryLabel = retrySeconds >= 60
    ? `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, '0')}`
    : `0:${String(retrySeconds).padStart(2, '0')}`;

  function changeEmail() {
    setChallenge(null);
    setCode('');
    setRetrySeconds(0);
  }

  function finishSignIn(payload) {
    startGuestSession(payload.guest, payload.token);
    toast.success('Signed in');
    onSuccess?.();
  }

  async function signInWithPassword(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/hotel/login', { email, password }, { skipErrorToast: true });
      finishSignIn(response.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign in');
    } finally { setBusy(false); }
  }

  async function requestCode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/email/request', { email }, { skipErrorToast: true });
      setChallenge(response.data.data);
      setCode('');
      setRetrySeconds(60);
    } catch (error) {
      const wait = Number(error.response?.data?.data?.retryAfterSeconds || error.response?.headers?.['retry-after'] || 0);
      if (Number.isFinite(wait) && wait > 0) setRetrySeconds(Math.ceil(wait));
      toast.error(error.response?.data?.message || 'Could not create a code');
    } finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/email/verify', { challengeId: challenge.challengeId, code }, { skipErrorToast: true });
      const payload = response.data.data;
      if (payload.needsName || payload.needsPassword) {
        setNameSetup(payload);
        setPassword('');
        setConfirmPassword('');
        setChallenge(null);
        return;
      }
      finishSignIn(payload);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not verify code');
    } finally { setBusy(false); }
  }

  async function completeProfile(event) {
    event.preventDefault();
    if (nameSetup.needsPassword && password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const endpoint = nameSetup.needsPassword ? '/public/auth/hotel/complete' : '/public/auth/email/complete';
      const response = await api.post(endpoint, { setupToken: nameSetup.setupToken, fullName, phone, password: nameSetup.needsPassword ? password : undefined }, { skipErrorToast: true });
      finishSignIn(response.data.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save your profile');
    } finally { setBusy(false); }
  }

  const inputClass = 'w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
  const buttonClass = 'flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50';
  const passwordLogin = hotel && !useCode;
  const switchMode = () => {
    setUseCode(value => !value);
    setPassword('');
    changeEmail();
  };
  return (
    <div className="w-full min-w-0">
      <h1 className="text-2xl font-bold text-text">{nameSetup?.needsPassword ? 'Set your hotel password' : nameSetup ? 'Finish setting up your account' : 'Sign in to book'}</h1>
      <p className="mt-1 text-sm text-text-muted">{nameSetup?.needsPassword ? `Your email is verified. Set a password for ${hotel.propertyName}.` : nameSetup ? 'Your email is verified. Add your name and contact number.' : hotel && useCode ? 'Verify your email to set or reset your hotel password and access your reservations.' : 'Use your email to book or manage your reservations.'}</p>
      {nameSetup ? (
        <form onSubmit={completeProfile} className="mt-5 space-y-4">
          {nameSetup.needsName && <>
          <div><label htmlFor="guest-name" className="mb-1 block text-sm font-semibold text-text">Your full name</label><input id="guest-name" className={inputClass} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} minLength={2} maxLength={200} autoFocus required /></div>
          <div>
            <label htmlFor="guest-phone" className="mb-1 block text-sm font-semibold text-text">Ghana mobile number</label>
            <input id="guest-phone" className={inputClass} type="tel" autoComplete="tel" placeholder="024 123 4567" value={phone} onChange={event => setPhone(event.target.value)} aria-describedby="guest-phone-help" required />
            <p id="guest-phone-help" className="mt-1 text-xs text-text-muted">Your phone number will remain unverified.</p>
          </div>
          </>}
          {nameSetup.needsPassword && <>
            <div><label htmlFor="guest-new-password" className="mb-1 block text-sm font-semibold text-text">New password</label><input id="guest-new-password" className={inputClass} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={10} required /></div>
            <div><label htmlFor="guest-confirm-password" className="mb-1 block text-sm font-semibold text-text">Confirm password</label><input id="guest-confirm-password" className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div>
          </>}
          <button className={buttonClass} disabled={busy}>{busy && <Loader2 size={18} className="animate-spin" />} Continue</button>
          <button type="button" className="w-full text-sm font-semibold text-primary-700 hover:underline" disabled={busy} onClick={() => { setNameSetup(null); changeEmail(); }}>Start again</button>
        </form>
      ) : challenge ? (
        <form onSubmit={verifyCode} className="mt-5 space-y-4">
          <p className="break-all text-sm text-text-muted">Enter the six-digit code for {challenge.email}.</p>
          {challenge.testCode && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center"><p className="text-xs font-semibold uppercase text-amber-800">Simulated email</p><p className="mt-1 font-mono text-3xl font-bold tracking-widest text-text">{challenge.testCode}</p><p className="mt-1 text-xs text-amber-900">Use this code below to continue.</p></div>}
          <div><label htmlFor="guest-code" className="mb-1 block text-sm font-semibold text-text">Verification code</label><input id="guest-code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required /></div>
          <button className={buttonClass} disabled={busy}>{busy && <Loader2 size={18} className="animate-spin" />} Verify and continue</button>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50" disabled={busy} onClick={changeEmail}><ArrowLeft size={17} /> Change email</button>
            <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || retrySeconds > 0} onClick={requestCode}>
              <RotateCw size={16} /> {retrySeconds > 0 ? `Resend in ${retryLabel}` : 'Resend code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={passwordLogin ? signInWithPassword : requestCode} className="mt-5 space-y-4">
          <div><label htmlFor="guest-email" className="mb-1 block text-sm font-semibold text-text">Email address</label><input id="guest-email" className={inputClass} type="email" autoComplete="email" maxLength={200} placeholder="you@example.com" value={email} disabled={busy} onChange={event => { setEmail(event.target.value); if (retrySeconds > 0) setRetrySeconds(0); }} required /></div>
          {passwordLogin && <div><label htmlFor="guest-password" className="mb-1 block text-sm font-semibold text-text">Password</label><input id="guest-password" className={inputClass} type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} required /></div>}
          <button className={buttonClass} disabled={busy || retrySeconds > 0}>{busy ? <Loader2 size={18} className="animate-spin" /> : !passwordLogin && <Mail size={18} />} {passwordLogin ? 'Sign in' : retrySeconds > 0 ? `Try again in ${retryLabel}` : 'Email me a code'}</button>
          {hotel && <button type="button" disabled={busy} className="w-full text-sm font-semibold text-primary-700 hover:underline" onClick={switchMode}>{passwordLogin ? 'Create an account or reset password' : 'Sign in with password'}</button>}
        </form>
      )}
    </div>
  );
}
