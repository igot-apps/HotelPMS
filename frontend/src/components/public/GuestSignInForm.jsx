import { useEffect, useRef, useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { startGuestSession } from '../../lib/guestSession';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let googleScriptPromise;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return googleScriptPromise;
}

export default function GuestSignInForm({ onSuccess }) {
  const [methods, setMethods] = useState(null);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [googleSetup, setGoogleSetup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const googleButton = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    let active = true;
    api.get('/public/auth/methods', { skipErrorToast: true }).then(({ data }) => {
      if (active) setMethods(data.data);
    }).catch(() => { if (active) setMethods({ googleEnabled: false, phoneEnabled: false }); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !methods?.googleEnabled || !googleButton.current) return;
    let active = true;
    loadGoogleScript().then(() => {
      if (!active || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setBusy(true);
          try {
            const response = await api.post('/public/auth/google', { credential }, { skipErrorToast: true });
            const payload = response.data.data;
            if (payload.needsPhone) {
              setGoogleSetup(payload);
              setFullName(payload.name || '');
              setChallenge(null);
            } else {
              startGuestSession(payload.guest, payload.token);
              toast.success('Signed in with Google');
              onSuccessRef.current?.();
            }
          } catch (error) {
            toast.error(error.response?.data?.message || 'Google sign-in failed');
          } finally { setBusy(false); }
        },
      });
      window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', width: Math.min(360, googleButton.current.clientWidth) });
    }).catch(() => toast.error('Could not load Google sign-in'));
    return () => { active = false; };
  }, [methods?.googleEnabled]);

  async function requestCode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/phone/request', { phone }, { skipErrorToast: true });
      setChallenge(response.data.data);
      setCode('');
      toast.success('Code ready');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create a code');
    } finally { setBusy(false); }
  }

  async function completeGoogle(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/google/complete', { setupToken: googleSetup.setupToken, phone, fullName }, { skipErrorToast: true });
      const payload = response.data.data;
      startGuestSession(payload.guest, payload.token);
      toast.success('Signed in with Google');
      onSuccessRef.current?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not finish Google sign-in');
    } finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/phone/verify', { challengeId: challenge.challengeId, code, fullName }, { skipErrorToast: true });
      const payload = response.data.data;
      startGuestSession(payload.guest, payload.token);
      toast.success('Signed in');
      onSuccessRef.current?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not verify code');
    } finally { setBusy(false); }
  }

  async function signInWithPassword(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post('/public/auth/login', { phone, password }, { skipErrorToast: true });
      const payload = response.data.data;
      startGuestSession(payload.guest, payload.token);
      toast.success('Signed in');
      onSuccessRef.current?.();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign in');
    } finally { setBusy(false); }
  }

  const inputClass = 'w-full min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
  const buttonClass = 'flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-bold text-white transition hover:bg-primary-700 disabled:opacity-50';
  return (
    <div className="w-full min-w-0">
      <h1 className="text-2xl font-bold text-text">Sign in to book</h1>
      <p className="mt-1 text-sm text-text-muted">{methods?.phoneEnabled ? 'Use Google or your Ghana mobile number. No password needed for new accounts.' : 'Continue with Google to book or manage your reservations.'}</p>
      {GOOGLE_CLIENT_ID && methods?.googleEnabled && !googleSetup && (
        <div className="mt-6 flex min-h-11 justify-center" ref={googleButton} aria-label="Sign in with Google" />
      )}
      {googleSetup && <div className="mt-5 rounded-xl bg-primary-50 p-3 text-sm text-primary-800">Google account verified. Add your contact number to finish. We will not send a code for this step.</div>}
      {(!GOOGLE_CLIENT_ID || !methods?.googleEnabled) && methods && (
        <p className="mt-5 rounded-xl bg-secondary-50 p-3 text-sm text-text-muted">Google sign-in is not configured yet.</p>
      )}
      {!googleSetup && <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-text-muted"><span className="h-px flex-1 bg-border" />{methods?.phoneEnabled ? 'Phone' : 'Existing account'}<span className="h-px flex-1 bg-border" /></div>}
      {challenge ? (
        <form onSubmit={verifyCode} className="space-y-4">
          <p className="text-sm text-text-muted">Enter the six-digit code for {challenge.phone}.</p>
          {challenge.testCode && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center"><p className="text-xs font-semibold uppercase text-amber-800">Test code · no SMS sent</p><p className="mt-1 font-mono text-3xl font-bold tracking-widest text-text">{challenge.testCode}</p></div>}
          <div><label htmlFor="guest-code" className="mb-1 block text-sm font-semibold text-text">Verification code</label><input id="guest-code" className={inputClass} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required /></div>
          <button className={buttonClass} disabled={busy}>{busy && <Loader2 size={18} className="animate-spin" />} Verify and continue</button>
          <button type="button" className="w-full text-sm font-semibold text-primary-700 hover:underline" onClick={() => setChallenge(null)}>Change phone number</button>
        </form>
      ) : (
        <form onSubmit={googleSetup ? completeGoogle : passwordMode ? signInWithPassword : requestCode} className="mt-5 space-y-4">
          {googleSetup && <div><label htmlFor="guest-name" className="mb-1 block text-sm font-semibold text-text">Your name</label><input id="guest-name" className={inputClass} value={fullName} onChange={event => setFullName(event.target.value)} maxLength={200} /></div>}
          {!googleSetup && !passwordMode && methods?.phoneEnabled && <div><label htmlFor="guest-name" className="mb-1 block text-sm font-semibold text-text">Your name <span className="font-normal text-text-muted">(for a new account)</span></label><input id="guest-name" className={inputClass} autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} maxLength={200} /></div>}
          {(googleSetup || methods?.phoneEnabled || passwordMode) && <div><label htmlFor="guest-phone" className="mb-1 block text-sm font-semibold text-text">Ghana mobile number</label><input id="guest-phone" className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" value={phone} onChange={event => setPhone(event.target.value)} required /></div>}
          {passwordMode && <div><label htmlFor="guest-password" className="mb-1 block text-sm font-semibold text-text">Existing password</label><input id="guest-password" className={inputClass} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div>}
          {(googleSetup || methods?.phoneEnabled || passwordMode) && <button className={buttonClass} disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} />}{googleSetup ? 'Continue with Google' : passwordMode ? 'Sign in' : 'Get code'}</button>}
          {googleSetup && <button type="button" className="w-full text-sm font-semibold text-primary-700 hover:underline" onClick={() => setGoogleSetup(null)}>Use another sign-in method</button>}
          {!googleSetup && <button type="button" className="w-full text-sm font-semibold text-primary-700 hover:underline" onClick={() => setPasswordMode(!passwordMode)}>{passwordMode ? (methods?.phoneEnabled ? 'Use a phone code' : 'Back to Google sign-in') : 'Have an existing password?'}</button>}
        </form>
      )}
    </div>
  );
}
