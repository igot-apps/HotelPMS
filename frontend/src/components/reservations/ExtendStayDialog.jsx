import { useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';

const dayAfter = (date) => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); };
const label = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Pick the new departure date from a calendar (replaces typing a date by hand).
export default function ExtendStayDialog({ room, onConfirm, onClose }) {
  const current = String(room.checkOutDate).slice(0, 10);
  const earliest = dayAfter(current);
  const [date, setDate] = useState(earliest);
  const nights = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${current}T00:00:00Z`)) / 86400000);
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="extend-title">
      <form onSubmit={(event) => { event.preventDefault(); if (date > current) onConfirm(date); }} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="extend-title" className="flex items-center gap-2 text-lg font-bold text-text"><CalendarPlus size={20} className="text-warning-600" /> Extend Room {room.room?.roomNumber || room.roomNumberSnapshot}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <p className="text-sm text-text-muted">Current check-out: <strong className="text-text">{label(current)}</strong></p>
        <label className="block text-sm font-medium text-text">New check-out date
          <input type="date" required min={earliest} value={date} onChange={(event) => setDate(event.target.value)} className="responsive-date-input mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text" />
        </label>
        {nights > 0 && <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning-800">Adds {nights} night{nights === 1 ? '' : 's'} at the agreed rate.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button>
          <button disabled={!(date > current)} className="min-h-11 rounded-lg bg-warning-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
        </div>
      </form>
    </div>
  );
}
