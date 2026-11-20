import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, History, Info, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { invalidateCorrections } from '../../lib/correction-actions';
import { serverNow } from '../../lib/serverClock';
import { fromHotelInput, toHotelInput } from '../../lib/stayTiming';

export const EVIDENCE_TYPES = [
  ['key-returned', 'Key or keycard was returned'],
  ['room-found-empty', 'Housekeeping found the room empty'],
  ['guest-confirmed', 'Guest confirmed by phone or message'],
  ['security-record', 'Security log or camera'],
  ['other', 'Other (explain below)'],
];
const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm text-text';
const cash = (value) => `GHS ${Number(value || 0).toFixed(2)}`;

// Forgotten checkout: record when the guest really left. Managers apply it; receptionists send it for approval.
export default function RecordDepartureDialog({ stay, onClose }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ departedAt: toHotelInput(serverNow()), evidenceType: '', evidenceNote: '', reason: 'Checkout was not recorded when the guest left.', contradictionNote: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = `/reservations/${stay.reservationId}`;
  const body = () => ({ action: 'record-departure', stayIds: [stay.reservationRoomId], departedAt: fromHotelInput(form.departedAt)?.toISOString(), evidenceType: form.evidenceType, evidenceNote: form.evidenceNote, reason: form.reason, ...(form.contradictionNote.trim() ? { contradictionNote: form.contradictionNote.trim() } : {}) });
  const change = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); if (key !== 'contradictionNote') setPreview(null); setError(''); };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!preview) {
        setPreview((await api.post(`${url}/corrections`, { ...body(), preview: true }, { skipErrorToast: true })).data.data);
        return;
      }
      await api.post(`${url}/corrections`, { ...body(), expectedVersion: preview.version }, { skipErrorToast: true });
      invalidateCorrections(queryClient);
      queryClient.invalidateQueries({ queryKey: ['checkoutAlerts'] });
      toast.success('Departure recorded and guest checked out.');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record the departure.');
    } finally { setBusy(false); }
  };

  const needsExplanation = preview?.contradictions?.length > 0;
  const ready = form.evidenceType && form.evidenceNote.trim().length >= 10 && form.reason.trim().length >= 5 && (!needsExplanation || form.contradictionNote.trim().length >= 10);

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="record-departure-title">
      <form onSubmit={submit} className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="record-departure-title" className="flex items-center gap-2 text-lg font-bold text-text"><History size={20} className="text-primary-600" /> Record actual departure</h2>
            <p className="text-sm text-text-muted">Room {stay.roomNumber || '—'} · {stay.guestName} · for a checkout that was not recorded in time</p>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <label className="block text-sm font-medium text-text">When did the guest actually leave?
            <input required type="datetime-local" max={toHotelInput(serverNow()) || undefined} value={form.departedAt} onChange={change('departedAt')} className={field} />
          </label>
          <label className="block text-sm font-medium text-text">Evidence
            <select required value={form.evidenceType} onChange={change('evidenceType')} className={field}>
              <option value="">Choose the evidence…</option>
              {EVIDENCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-text">Explain the evidence
            <textarea required minLength={10} maxLength={500} rows={2} value={form.evidenceNote} onChange={change('evidenceNote')} placeholder="What was seen, by whom, and when" className={field} />
          </label>
          <label className="block text-sm font-medium text-text">Reason
            <input required minLength={5} maxLength={500} value={form.reason} onChange={change('reason')} className={field} />
          </label>
        </fieldset>

        {preview && (
          <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
            <p className="text-text">{preview.message}</p>
            <p className="flex justify-between"><span className="text-text-muted">Nights charged</span><strong className="text-text">{preview.nightsCharged} (departure {preview.newCheckOutDate})</strong></p>
            <p className="flex justify-between"><span className="text-text-muted">Booking total</span><span>{preview.newTotal !== preview.oldTotal && <s className="mr-2 text-text-muted">{cash(preview.oldTotal)}</s>}<strong className="text-text">{cash(preview.newTotal)}</strong></span></p>
            {preview.credit > 0 && <p className="flex justify-between"><span className="text-text-muted">Overpaid (refund through Refunds)</span><strong className="text-success-700">{cash(preview.credit)}</strong></p>}
            {preview.balanceDue > 0 && <p className="flex justify-between"><span className="text-text-muted">Balance still owed</span><strong className="text-danger-700">{cash(preview.balanceDue)}</strong></p>}
            {preview.contradictions?.map((line) => <p key={line} className="flex gap-2 text-danger-700"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{line}</p>)}
            {preview.information?.map((line) => <p key={line} className="flex gap-2 text-text-muted"><Info size={15} className="mt-0.5 shrink-0" />{line}</p>)}
            {needsExplanation && (
              <label className="block font-medium text-danger-700">Records suggest the guest was still here later. Explain why this time is correct
                <textarea required minLength={10} maxLength={500} rows={2} value={form.contradictionNote} onChange={change('contradictionNote')} className={field} />
              </label>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">Cancel</button>
          <button disabled={busy || !ready} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {!preview ? 'Preview' : 'Record departure and check out'}
          </button>
        </div>
      </form>
    </div>
  );
}
