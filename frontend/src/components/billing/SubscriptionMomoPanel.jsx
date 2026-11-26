import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { initializeSubscriptionPayment, submitSubscriptionOtp, verifyPayment } from '../../api/billing';
import { guessNetwork, MOMO_NETWORKS, SandboxBanner, SANDBOX_TEST_NUMBER } from '../public/MomoPaymentPanel';

const PENDING_KEY = 'billing-pending-payment';
const field = 'block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const readPending = () => { try { return localStorage.getItem(PENDING_KEY) || ''; } catch { return ''; } };
const savePending = (ref) => { try { if (ref) localStorage.setItem(PENDING_KEY, ref); else localStorage.removeItem(PENDING_KEY); } catch { /* optional */ } };

/**
 * Subscription payment with Moolre mobile money. The order and its reference are created on the
 * server before Moolre is contacted; this panel only ever checks that same reference.
 */
export default function SubscriptionMomoPanel({ params, amountLabel, defaultPhone, testMode, onApplied, onCancel }) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [network, setNetwork] = useState(() => guessNetwork(defaultPhone));
  const [otp, setOtp] = useState('');
  const [reference, setReference] = useState(readPending);
  const [step, setStep] = useState(() => (readPending() ? 'waiting' : 'form'));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  const since = useRef(Date.now());

  // Test mode: Moolre's sandbox code 123456 only works for its test numbers, so start with one
  // (only while the number is still the pre-filled one).
  useEffect(() => {
    if (!testMode) return;
    if (phone === (defaultPhone || '')) { setPhone(SANDBOX_TEST_NUMBER); setNetwork('MTN'); }
  }, [testMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (ref) => { clearTimeout(timer.current); savePending(''); setReference(''); onApplied?.(ref); };

  const check = async (ref) => {
    try {
      const status = (await verifyPayment(ref)).data.data?.status;
      if (status === 'success') return finish(ref);
      if (status === 'failed') { savePending(''); setReference(''); setStep('form'); setError('The payment was not completed. You were not charged. Try again.'); return; }
      if (status === 'otp_required') { setStep('otp'); return; }
    } catch (err) {
      if (err.response?.status === 400 && /not found/i.test(err.response?.data?.message || '')) { savePending(''); setReference(''); setStep('form'); return; }
    }
    const elapsed = Date.now() - since.current;
    if (elapsed > 10 * 60 * 1000) { setStep('stalled'); return; }
    timer.current = setTimeout(() => check(ref), elapsed < 2 * 60 * 1000 ? 5000 : 15000);
  };

  const wait = (ref) => {
    setStep('waiting');
    since.current = Date.now();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => check(ref), 5000);
  };

  useEffect(() => {
    const pending = readPending();
    if (pending) wait(pending);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handle = (result) => {
    if (result?.applied) return finish(result.reference);
    if (!result?.reference) throw new Error('Could not start the payment.');
    setReference(result.reference);
    savePending(result.reference);
    setMessage(result.message || '');
    if (result.step === 'otp_required') { setStep('otp'); setOtp(''); return; }
    wait(result.reference); // prompt_sent or unknown: keep checking the same reference
  };

  const run = async (request) => {
    setBusy(true); setError('');
    try { handle((await request()).data.data); }
    catch (err) { setError(err.response?.data?.message || err.message || 'Could not start the payment.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-primary-100 bg-primary-50/40 p-4 text-left">
      {testMode && <SandboxBanner />}
      <p className="flex items-center justify-between gap-2 text-sm font-bold text-text">
        <span className="flex items-center gap-2"><Smartphone size={16} className="text-primary-600" /> Pay with mobile money</span>
        {amountLabel && <span className="text-primary-700">{amountLabel}</span>}
      </p>
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 p-2.5 text-xs text-danger-700"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}

      {step === 'form' && <>
        <label className="block text-xs font-semibold text-text-muted">Mobile money number
          <input type="tel" inputMode="tel" value={phone} onChange={e => { setPhone(e.target.value); setNetwork(guessNetwork(e.target.value)); }} placeholder="024 123 4567" className={`mt-1 ${field}`} disabled={busy} />
        </label>
        <label className="block text-xs font-semibold text-text-muted">Network
          <select value={network} onChange={e => setNetwork(e.target.value)} className={`mt-1 ${field}`} disabled={busy}>
            {MOMO_NETWORKS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !phone.trim()} onClick={() => run(() => initializeSubscriptionPayment({ ...params, phone, network }))}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-text-inverted hover:bg-primary-700 disabled:opacity-50">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Sending request…</> : 'Send payment request'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy} className="w-full text-center text-xs font-semibold text-text-muted hover:underline">Cancel</button>}
      </>}

      {step === 'otp' && <>
        <p className="text-xs text-text">{message || 'Enter the code sent to your phone by SMS.'}</p>
        <label className="block text-xs font-semibold text-text-muted">SMS code
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} className={`mt-1 tracking-[0.3em] ${field}`} disabled={busy} />
        </label>
        <button type="button" disabled={busy || otp.length < 4} onClick={() => run(() => submitSubscriptionOtp(reference, otp))}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-text-inverted hover:bg-primary-700 disabled:opacity-50">
          {busy ? <><Loader2 size={16} className="animate-spin" /> Checking code…</> : 'Confirm code'}
        </button>
        <button type="button" disabled={busy} onClick={() => { savePending(''); setReference(''); setStep('form'); }} className="w-full text-center text-xs font-semibold text-text-muted hover:underline">Start again</button>
      </>}

      {step === 'waiting' && (
        <div className="space-y-2 py-2 text-center">
          <Loader2 size={26} className="mx-auto animate-spin text-primary-600" />
          <p className="text-sm font-semibold text-text">Approve the prompt on your phone</p>
          <p className="text-xs text-text-muted">{message || 'Enter your mobile money PIN.'} We are checking automatically. Please don't pay again.</p>
        </div>
      )}
      {step === 'stalled' && (
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-text">Still waiting for confirmation</p>
          <p className="text-xs text-text-muted">If you approved the payment, your plan updates once it is confirmed. Do not pay again.</p>
          <button type="button" onClick={() => wait(reference)} className="text-xs font-semibold text-primary-700 hover:underline">Check again</button>
        </div>
      )}
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted"><ShieldCheck size={12} /> Secured by Moolre · MTN · Telecel · AT</p>
    </div>
  );
}
