import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { invalidateCorrections } from '../../lib/correction-actions';

const REASON = 'Guest checked out early';
const cash = (value) => `GHS ${Number(value || 0).toFixed(2)}`;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const dateLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Shown only when a guest checks out before their scheduled departure date.
export default function EarlyCheckoutDialog({ room, reservation, today, onCheckOut, onClose }) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState('keep');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scheduled = String(room.checkOutDate).slice(0, 10);
  const arrival = String(room.checkInDate).slice(0, 10);
  // At least one night stays on the booking: a guest who arrived today is charged for one night.
  const arrivedToday = today <= arrival;
  const newCheckOutDate = arrivedToday ? addDays(arrival, 1) : today;
  const canShorten = newCheckOutDate < scheduled;
  const correction = { action: 'correct-date', stayIds: [room.reservationRoomId], newCheckOutDate, reason: REASON };
  const url = `/reservations/${reservation.reservationId}`;

  const choose = async (next) => {
    setChoice(next);
    setError('');
    if (next !== 'shorten' || preview) return;
    setBusy(true);
    try {
      setPreview((await api.post(`${url}/corrections`, { ...correction, preview: true }, { skipErrorToast: true })).data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not calculate the shortened stay.');
      setChoice('keep');
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    let shortened = false;
    try {
      if (choice === 'shorten') {
        if (!preview.canApply) {
          // Outside the receptionist's limit: ask a manager. The booking stays unchanged until approved.
          throw Object.assign(new Error(), { response: { data: { message: 'Only a manager can make this change. Ask a manager to do it.' } } });
          invalidateCorrections(queryClient);
          toast.success('Sent to a manager for approval. Check the guest out once it is approved.');
          onClose();
          return;
        }
        await api.post(`${url}/corrections`, { ...correction, expectedVersion: preview.version }, { skipErrorToast: true });
        shortened = true;
        invalidateCorrections(queryClient);
      }
      await onCheckOut();
    } catch (err) {
      const message = err.response?.data?.message || 'Could not complete the checkout.';
      if (shortened) {
        // The stay is already shortened; only the checkout itself is left to retry.
        setChoice('keep');
        setError(`The stay was shortened, but the guest is not checked out yet: ${message}`);
      } else setError(message);
      setPreview(null);
    } finally { setBusy(false); }
  };

  const option = (value, title, text, disabled = false) => (
    <label className={`flex gap-3 rounded-lg border p-3 text-sm ${choice === value ? 'border-primary-500 bg-primary-50/60' : 'border-border'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name="early-checkout" className="mt-1 accent-primary-600" checked={choice === value} disabled={disabled || busy} onChange={() => choose(value)} />
      <span><span className="block font-semibold text-text">{title}</span><span className="text-text-muted">{text}</span></span>
    </label>
  );

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="early-checkout-title">
      <section className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="early-checkout-title" className="flex items-center gap-2 text-lg font-bold text-text"><CalendarClock size={20} className="text-warning-600" /> Guest is checking out early</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <p className="text-sm text-text-muted">
          Room {room.room?.roomNumber || room.roomNumberSnapshot} (booking {reservation.confirmationCode}) is booked until <strong className="text-text">{dateLabel(scheduled)}</strong>. How would you like to handle the remaining nights?
        </p>

        <div className="space-y-2">
          {option('keep', 'Keep original charges', 'Guest pays the full agreed booking amount.')}
          {option('shorten', 'Shorten stay and recalculate charges', !canShorten ? 'Not available: only one night is booked, and at least one night is always charged.' : arrivedToday ? `Charge one night only (departure ${dateLabel(newCheckOutDate)}) and recalculate the balance.` : `Change departure to today (${dateLabel(today)}) and recalculate the balance.`, !canShorten)}
        </div>

        {choice === 'shorten' && preview && (
          <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
            <p className="flex justify-between"><span className="text-text-muted">Booking total</span><span><s className="mr-2 text-text-muted">{cash(preview.oldTotal)}</s><strong className="text-text">{cash(preview.newTotal)}</strong></span></p>
            {preview.balanceDue > 0 && <p className="flex justify-between"><span className="text-text-muted">Balance still due</span><strong className="text-danger-700">{cash(preview.balanceDue)}</strong></p>}
            {preview.credit > 0 && <p className="flex justify-between"><span className="text-text-muted">Overpaid (refund through Refunds)</span><strong className="text-success-700">{cash(preview.credit)}</strong></p>}
            {!preview.canApply && <p className="pt-1 text-amber-800">{preview.delegationReason} The booking stays unchanged and the guest is not checked out until a manager approves.</p>}
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || (choice === 'shorten' && !preview)} onClick={confirm} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {choice === 'shorten' && preview && !preview.canApply ? 'Send for manager approval' : choice === 'shorten' ? 'Shorten stay and check out' : 'Check out'}
          </button>
        </div>
      </section>
    </div>
  );
}
