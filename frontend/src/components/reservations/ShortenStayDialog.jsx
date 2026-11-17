import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarMinus, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { invalidateCorrections } from '../../lib/correction-actions';

const cash = (value) => `GH₵ ${Number(value || 0).toFixed(2)}`;
const DAY = 86400000;
const addDays = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
const nightsBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY);
const label = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const localToday = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const REFUND_REASON = 'Guest left early — refund for unused nights.';

// Shorten a stay to remove unused nights (same correction and rules as the Corrections panel),
// then offer to request the refund for any overpayment.
export default function ShortenStayDialog({ room, reservationId, onClose }) {
  const queryClient = useQueryClient();
  const isManager = useAuthStore((state) => state.user?.role) === 'Manager';
  const arrival = String(room.checkInDate).slice(0, 10);
  const current = String(room.checkOutDate).slice(0, 10);
  const today = localToday();
  const earliest = [today, addDays(arrival, 1)].sort().at(-1); // nights before today are already used
  const latest = addDays(current, -1);
  const possible = earliest <= latest;
  const [date, setDate] = useState(possible ? earliest : current);
  const [preview, setPreview] = useState(null);
  const [credit, setCredit] = useState(null); // set once the stay is shortened
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = `/reservations/${reservationId}`;
  const correction = { action: 'correct-date', stayIds: [room.reservationRoomId], newCheckOutDate: date, reason: 'Guest is leaving early; unused nights removed.' };
  const refresh = () => { invalidateCorrections(queryClient); queryClient.invalidateQueries({ queryKey: ['dashboardGlance'] }); };

  const run = async (work) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await work(); } catch (err) { setError(err.response?.data?.message || 'Something went wrong. Try again.'); } finally { setBusy(false); }
  };

  const previewShorten = () => run(async () => {
    setPreview((await api.post(`${url}/corrections`, { ...correction, preview: true }, { skipErrorToast: true })).data.data);
  });

  const applyShorten = () => run(async () => {
    if (!preview.canApply) {
      await api.post(`${url}/correction-requests`, { ...correction, expectedVersion: preview.version }, { skipErrorToast: true });
      refresh();
      toast.success('Sent to a manager for approval.');
      onClose();
      return;
    }
    await api.post(`${url}/corrections`, { ...correction, expectedVersion: preview.version }, { skipErrorToast: true });
    refresh();
    toast.success(`Stay shortened to ${label(date)}.`);
    if (preview.credit > 0) setCredit(preview.credit); else onClose();
  });

  // One-tap refund request for the unused nights, split across the original payments if needed.
  const requestRefund = () => run(async () => {
    const overview = (await api.get(`${url}/refunds`, { skipErrorToast: true })).data.data;
    let remaining = Math.round(Math.min(credit, overview.refundable) * 100);
    const sent = [];
    for (const payment of overview.payments.filter((p) => p.available > 0)) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, Math.round(payment.available * 100)) / 100;
      const body = { paymentId: payment.paymentId, amount, reason: REFUND_REASON, mode: 'Manual' };
      const check = (await api.post(`${url}/refund-requests`, { ...body, preview: true }, { skipErrorToast: true })).data.data;
      await api.post(`${url}/refund-requests`, { ...body, expectedVersion: check.version }, { skipErrorToast: true });
      sent.push(amount);
      remaining -= Math.round(amount * 100);
    }
    refresh();
    if (!sent.length) throw Object.assign(new Error(), { response: { data: { message: 'No refundable payment was found. Check the Refunds section of the reservation.' } } });
    toast.success(`Refund request for ${cash(sent.reduce((a, b) => a + b, 0))} sent to the manager.`);
    onClose();
  });

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="shorten-title">
      <section className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="shorten-title" className="flex items-center gap-2 text-lg font-bold text-text"><CalendarMinus size={20} className="text-primary-600" /> Shorten Room {room.room?.roomNumber || room.roomNumberSnapshot}</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>

        {credit !== null ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-success-50 p-3 text-success-800">Stay shortened. The guest has overpaid <strong>{cash(credit)}</strong> for unused nights.</p>
            {isManager ? (
              <p className="text-text-muted">Record the refund in the reservation's <Link to={`${url}#refunds`} onClick={onClose} className="font-semibold text-primary-700 underline">Refunds</Link> section when the money is returned.</p>
            ) : (
              <p className="text-text-muted">Refunds need a manager's approval. Send the request now, or leave it to handle later from the reservation's Refunds section.</p>
            )}
            {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-danger-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-text">{isManager ? 'Done' : 'Later'}</button>
              {!isManager && <button type="button" disabled={busy} onClick={requestRefund} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Request refund of {cash(credit)}</button>}
            </div>
          </div>
        ) : !possible ? (
          <p className="rounded-lg bg-secondary-50 p-3 text-sm text-text-muted">There are no unused nights to remove — the guest is already on the last night of the booking.</p>
        ) : (
          <>
            <p className="text-sm text-text-muted">Booked {label(arrival)} → {label(current)} ({nightsBetween(arrival, current)} nights). Nights already used can't be removed.</p>
            <label className="block text-sm font-medium text-text">New check-out date
              <input type="date" required min={earliest} max={latest} value={date} disabled={busy} onChange={(event) => { setDate(event.target.value); setPreview(null); setError(''); }} className="responsive-date-input mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text" />
            </label>
            <p className="text-sm text-text-muted">Removes <strong className="text-text">{nightsBetween(date, current)}</strong> unused night{nightsBetween(date, current) === 1 ? '' : 's'} · guest stays {nightsBetween(arrival, date)} night{nightsBetween(arrival, date) === 1 ? '' : 's'}.</p>
            {preview && (
              <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
                <p className="flex justify-between"><span className="text-text-muted">Booking total</span><span><s className="mr-2 text-text-muted">{cash(preview.oldTotal)}</s><strong className="text-text">{cash(preview.newTotal)}</strong></span></p>
                {preview.credit > 0 && <p className="flex justify-between"><span className="text-text-muted">Overpaid (to refund)</span><strong className="text-success-700">{cash(preview.credit)}</strong></p>}
                {preview.balanceDue > 0 && <p className="flex justify-between"><span className="text-text-muted">Balance still due</span><strong className="text-danger-700">{cash(preview.balanceDue)}</strong></p>}
              </div>
            )}
            {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button>
              <button type="button" disabled={busy || !date} onClick={preview ? applyShorten : previewShorten} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy && <Loader2 size={16} className="animate-spin" />}{preview ? 'Shorten stay' : 'Preview'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
