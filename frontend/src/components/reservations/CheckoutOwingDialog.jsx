import { useState } from 'react';
import { AlertTriangle, Loader2, LogOut, Wallet, X } from 'lucide-react';

const OTHER = 'Other';
export const OWING_REASONS = [
  'Guest promised to pay later.',
  'Guest disputed the outstanding amount.',
  'Company or sponsor will settle the balance.',
  OTHER,
];

const field = 'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-text outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

// Checkout when the guest still owes money. Nothing about the money changes here: the balance
// stays on the booking for collection, and the reason is saved with the checkout record.
export default function CheckoutOwingDialog({ roomNumber, guestName, code, balanceDue, lateText, onTakePayment, onCheckOut, onClose }) {
  const [choice, setChoice] = useState('');
  const [otherText, setOtherText] = useState('');
  const [departureNote, setDepartureNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const otherTrimmed = otherText.trim();
  const reason = choice === OTHER ? (otherTrimmed.length >= 5 ? `Other: ${otherTrimmed}` : '') : choice;

  const submit = async (event) => {
    event.preventDefault();
    if (!choice) return setError('Choose why the guest is leaving with money owed.');
    if (!reason) return setError('Write a short explanation (at least 5 characters).');
    setError('');
    setSaving(true);
    try {
      await onCheckOut(reason, departureNote.trim().slice(0, 300));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not check out this guest. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="owing-checkout-title">
      <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id="owing-checkout-title" className="flex items-center gap-2 text-xl font-bold text-text"><LogOut size={20} className="text-primary-600" /> Check out Room {roomNumber}</h2>
            <p className="mt-1 text-xs text-text-muted">{guestName}{code ? ` · ${code}` : ''}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-secondary-100"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-danger-100 bg-danger-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger-700"><AlertTriangle size={16} /> Booking balance still owed</p>
            <p className="mt-1 text-2xl font-bold text-danger-700">GHS {Number(balanceDue || 0).toFixed(2)}</p>
          </div>

          <button type="button" onClick={onTakePayment} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-text-inverted hover:bg-primary-700">
            <Wallet size={16} /> Take payment first
          </button>

          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-text-muted"><span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" /></div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-text">Check out with money owed <span className="text-danger-600">*</span> <span className="font-normal text-text-muted">(reason required)</span></legend>
            {OWING_REASONS.map((option) => (
              <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${choice === option ? 'border-primary-400 bg-primary-50' : 'border-border'}`}>
                <input type="radio" name="owing-reason" value={option} checked={choice === option} onChange={() => { setChoice(option); setError(''); }} className="h-4 w-4 accent-primary-600" />
                <span className="text-text">{option === OTHER ? 'Other (explain below)' : option}</span>
              </label>
            ))}
            {choice === OTHER && (
              <textarea autoFocus value={otherText} onChange={(e) => setOtherText(e.target.value)} maxLength={400} rows={2} placeholder="Explain why the guest is leaving without paying" className={field} />
            )}
          </fieldset>

          {lateText && (
            <div>
              <p className="mb-1.5 text-xs text-warning-700">{lateText}</p>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">Late departure note <span className="font-normal">(optional)</span></label>
              <input type="text" value={departureNote} onChange={(e) => setDepartureNote(e.target.value)} maxLength={300} className={field} />
            </div>
          )}

          <p className="text-xs text-text-muted">The GHS {Number(balanceDue || 0).toFixed(2)} stays on this booking and appears under “Owed after checkout” until it is paid.</p>
          {error && <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-surface p-4 sm:p-5">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text hover:bg-secondary-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex min-h-11 items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-semibold text-white hover:bg-danger-700 disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />} Check out with money owed
          </button>
        </div>
      </form>
    </div>
  );
}
