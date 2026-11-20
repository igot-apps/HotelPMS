import { useState } from 'react';
import { hotelToday } from '../../lib/period';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarMinus, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { invalidateCorrections } from '../../lib/correction-actions';

const cash = (value) => `GHS ${Number(value || 0).toFixed(2)}`;
const DAY = 86400000;
const addDays = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
const nightsBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY);
const label = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Shorten a stay to remove unused nights (same correction and rules as the Corrections panel),
// then point staff to record the refund for any overpayment.
export default function ShortenStayDialog({ room, reservationId, timeZone, onClose }) {
  const queryClient = useQueryClient();
  const arrival = String(room.checkInDate).slice(0, 10);
  const current = String(room.checkOutDate).slice(0, 10);
  const today = hotelToday(timeZone); // server time; null until known
  const earliest = today && [today, addDays(arrival, 1)].sort().at(-1); // nights before today are already used
  const latest = addDays(current, -1);
  const possible = Boolean(earliest) && earliest <= latest;
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
      throw Object.assign(new Error(), { response: { data: { message: 'Only a manager can make this change. Ask a manager to do it.' } } });
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
            <p className="text-text-muted">Give the guest their money back, then record it in the reservation's Refunds section. No approval is needed.</p>
            {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-danger-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-text">Later</button>
              <Link to={`${url}#refunds`} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white">Record refund of {cash(credit)}</Link>
            </div>
          </div>
        ) : !possible ? (
          <p className="rounded-lg bg-secondary-50 p-3 text-sm text-text-muted">There are no unused nights to remove — the guest is already on the last night of the booking.</p>
        ) : (
          <>
            <p className="text-sm text-text-muted">Booked {label(arrival)} → {label(current)} ({nightsBetween(arrival, current)} nights). Nights already used can't be removed.</p>
            <button type="button" disabled={busy} onClick={() => { setDate(earliest); setPreview(null); setError(''); }} aria-pressed={date === earliest}
              className={`min-h-12 w-full rounded-lg border px-3 py-2 text-left text-sm transition ${date === earliest ? 'border-primary-500 bg-primary-50 font-semibold text-primary-700' : 'border-border text-text hover:bg-secondary-50'}`}>
              Leave on the earliest date: {label(earliest)}
            </button>
            <label className="block text-sm font-semibold text-text">
              Or pick the new check-out date
              <span className="mt-1.5 flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20">
                <CalendarDays size={18} className="shrink-0 text-text-muted" />
                <input type="date" required min={earliest} max={latest} value={date} disabled={busy} onChange={(event) => { setDate(event.target.value); setPreview(null); setError(''); }}
                  className="min-w-0 flex-1 bg-transparent py-2 text-base font-normal text-text outline-none" />
              </span>
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
