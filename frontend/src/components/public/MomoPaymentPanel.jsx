import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Smartphone, ShieldCheck, AlertCircle } from 'lucide-react';
import api from '../../lib/axios';

export const MOMO_NETWORKS = [
  { value: 'MTN', label: 'MTN MoMo' },
  { value: 'TELECEL', label: 'Telecel Cash' },
  { value: 'AT', label: 'AT Money' },
];

// Best guess of the network from the number prefix; the guest can always change it.
export function guessNetwork(phone) {
  const local = String(phone || '').replace(/\D/g, '').replace(/^233/, '0');
  const prefix = local.slice(0, 3);
  if (['024', '054', '055', '059', '025', '053'].includes(prefix)) return 'MTN';
  if (['020', '050'].includes(prefix)) return 'TELECEL';
  if (['026', '056', '027', '057'].includes(prefix)) return 'AT';
  return 'MTN';
}

export const SANDBOX_TEST_NUMBER = '0240000111';

/** Shown on every Moolre payment form while the backend is in sandbox. */
export function SandboxBanner() {
  return (
    <div role="note" className="rounded-md bg-warning-100 px-2 py-1.5 text-center text-warning-800">
      <p className="text-[11px] font-bold uppercase tracking-wide">Test mode · no real money moves</p>
      {/* Moolre's sandbox texts a real code to any other number, so 123456 only works for its test numbers. */}
      <p className="mt-0.5 text-[11px]">Use MTN number <strong>{SANDBOX_TEST_NUMBER}</strong> and SMS code <strong>123456</strong>.</p>
    </div>
  );
}
const field ='block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';
const POLL_FAST_MS = 5000;
const POLL_SLOW_MS = 15000;
const POLL_FOR_MS = 10 * 60 * 1000;

/**
 * Guest mobile money checkout with Moolre: number + network → SMS code (first time only) →
 * approve the prompt on the phone → status is checked automatically until it settles.
 * The server owns every reference; this component never retries with a new one.
 */
export default function MomoPaymentPanel({ propertyCode, reservationId, amount, defaultPhone, testMode: testModeProp, onPaid, onReleased, onCancel }) {
  // Pages that already loaded the hotel pass testMode; otherwise read it from the same cached hotel query.
  const { data: hotel } = useQuery({
    queryKey: ['publicProperty', propertyCode],
    queryFn: async () => (await api.get(`/public/${propertyCode}`)).data.data,
    enabled: testModeProp === undefined && Boolean(propertyCode),
  });
  const testMode = testModeProp ?? hotel?.paymentTestMode;
  const [phone, setPhone] = useState(defaultPhone || '');
  const [network, setNetwork] = useState(() => guessNetwork(defaultPhone));
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('form'); // form | otp | waiting | stalled
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pollTimer = useRef(null);
  const waitingSince = useRef(0);
  const finished = useRef(false);

  useEffect(() => () => clearTimeout(pollTimer.current), []);
  // Test mode: Moolre's sandbox code 123456 only works for its test numbers, so start with one
  // (only while the guest hasn't typed their own number yet).
  useEffect(() => {
    if (!testMode) return;
    setPhone(current => (current === (defaultPhone || '') ? SANDBOX_TEST_NUMBER : current));
    setNetwork(current => (phone === (defaultPhone || '') ? 'MTN' : current));
  }, [testMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (data) => {
    if (!data) return;
    if (data.status === 'paid') {
      finished.current = true;
      clearTimeout(pollTimer.current);
      onPaid?.(data.checkedReference || data.reference);
      return;
    }
    if (data.status === 'released') { finished.current = true; clearTimeout(pollTimer.current); onReleased?.(data.message); return; }
    if (data.status === 'otp_required') { setStep('otp'); setOtp(''); setMessage(data.message || 'Enter the code sent to your phone by SMS.'); return; }
    if (data.status === 'failed') { setStep('form'); setError(data.message || 'The payment did not go through. Check the number and try again.'); return; }
    if (data.status === 'pending' || data.status === 'unknown') {
      setMessage(data.message || 'Approve the payment prompt on your phone.');
      startWaiting();
    }
  };

  const poll = async () => {
    if (finished.current) return;
    try {
      const { data } = await api.get(`/public/${propertyCode}/reservations/${reservationId}/payment-status`, { skipErrorToast: true });
      const s = data.data;
      if (s.status === 'paid' || s.status === 'released') return handle(s);
      if (s.status === 'unpaid') {
        // The provider confirmed the attempt failed (declined, low balance, wrong PIN, timed out).
        setStep('form'); setError('The payment was not completed. You were not charged. Check your balance and try again.'); return;
      }
      if (s.status === 'retryable') { setStep('form'); setError(s.message); return; }
      if (s.status === 'otp_required') { setStep('otp'); setMessage(s.message); return; }
    } catch { /* Network hiccup: keep checking the same payment. */ }
    const elapsed = Date.now() - waitingSince.current;
    if (elapsed >= POLL_FOR_MS) { setStep('stalled'); return; }
    pollTimer.current = setTimeout(poll, elapsed < 2 * 60 * 1000 ? POLL_FAST_MS : POLL_SLOW_MS);
  };

  const startWaiting = () => {
    setStep('waiting');
    waitingSince.current = Date.now();
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(poll, POLL_FAST_MS);
  };

  const run = async (request) => {
    setBusy(true); setError('');
    try { handle((await request()).data.data); }
    catch (err) { setError(err.response?.data?.message || 'Could not reach the payment service. Check payment status before trying again.'); }
    finally { setBusy(false); }
  };

  const start = (e) => {
    e.preventDefault();
    if (busy) return;
    run(() => api.post(`/public/${propertyCode}/payments/initialize`, { reservationId, phone, network }, { skipErrorToast: true }));
  };
  const submitOtp = (e) => {
    e.preventDefault();
    if (busy) return;
    run(() => api.post(`/public/${propertyCode}/payments/otp`, { reservationId, otp }, { skipErrorToast: true }));
  };

  return (
    <div className="space-y-3 rounded-xl border border-primary-100 bg-primary-50/40 p-4 text-left">
      {testMode && <SandboxBanner />}
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-text"><Smartphone size={16} className="text-primary-600" /> Pay with mobile money</p>
        {amount != null && <p className="text-sm font-bold text-primary-700">GH₵ {Number(amount).toFixed(2)}</p>}
      </div>

      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 p-2.5 text-xs text-danger-700"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>}

      {step === 'form' && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-text-muted">Mobile money number
            <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={e => { setPhone(e.target.value); setNetwork(guessNetwork(e.target.value)); }} placeholder="024 123 4567" className={`mt-1 ${field}`} disabled={busy} />
          </label>
          <label className="block text-xs font-semibold text-text-muted">Network
            <select value={network} onChange={e => setNetwork(e.target.value)} className={`mt-1 ${field}`} disabled={busy}>
              {MOMO_NETWORKS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={start} disabled={busy || !phone.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Sending request…</> : 'Send payment request'}
          </button>
          {onCancel && <button type="button" onClick={onCancel} disabled={busy} className="w-full text-center text-xs font-semibold text-text-muted hover:underline">Cancel</button>}
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-3">
          <p className="text-xs text-text">{message}</p>
          <label className="block text-xs font-semibold text-text-muted">SMS code
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} className={`mt-1 tracking-[0.3em] ${field}`} disabled={busy} />
          </label>
          <button type="button" onClick={submitOtp} disabled={busy || otp.length < 4} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
            {busy ? <><Loader2 size={16} className="animate-spin" /> Checking code…</> : 'Confirm code'}
          </button>
          <button type="button" onClick={() => { setStep('form'); setError(''); }} disabled={busy} className="w-full text-center text-xs font-semibold text-text-muted hover:underline">Use a different number</button>
        </div>
      )}

      {step === 'waiting' && (
        <div className="space-y-2 py-2 text-center">
          <Loader2 size={28} className="mx-auto animate-spin text-primary-600" />
          <p className="text-sm font-semibold text-text">Approve the prompt on your phone</p>
          <p className="text-xs text-text-muted">{message || 'Enter your mobile money PIN on your phone.'} We are checking automatically. Please don't pay again.</p>
        </div>
      )}

      {step === 'stalled' && (
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-text">Still waiting for confirmation</p>
          <p className="text-xs text-text-muted">If you approved the payment, it will show in My Reservations once confirmed. Do not pay again.</p>
          <button type="button" onClick={startWaiting} className="text-xs font-semibold text-primary-700 hover:underline">Check again</button>
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted"><ShieldCheck size={12} /> Secured by Moolre · MTN MoMo · Telecel Cash · AT Money</p>
    </div>
  );
}
