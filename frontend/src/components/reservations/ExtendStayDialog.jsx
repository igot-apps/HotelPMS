import { useState } from 'react';
import { CalendarDays, CalendarPlus, X } from 'lucide-react';

const addDays = (date, days) => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const label = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortLabel = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const QUICK_NIGHTS = [1, 2, 3, 7];

// Extend a stay: tap how many extra nights, or pick any later date from the calendar.
export default function ExtendStayDialog({ room, onConfirm, onClose, busy = false }) {
  const current = String(room.checkOutDate).slice(0, 10);
  const earliest = addDays(current, 1);
  const [date, setDate] = useState(earliest);
  const nights = date ? Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${current}T00:00:00Z`)) / 86400000) : 0;
  const valid = Boolean(date) && date > current;
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="extend-title">
      <form onSubmit={(event) => { event.preventDefault(); if (valid) onConfirm(date); }} className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="extend-title" className="flex items-center gap-2 text-lg font-bold text-text"><CalendarPlus size={20} className="text-warning-600" /> Extend Room {room.room?.roomNumber || room.roomNumberSnapshot}</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text disabled:opacity-50"><X size={18} /></button>
        </div>
        <p className="text-sm text-text-muted">Leaving now on: <strong className="text-text">{label(current)}</strong></p>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text">How many extra nights?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_NIGHTS.map((extra) => {
              const option = addDays(current, extra);
              const selected = date === option;
              return (
                <button key={extra} type="button" onClick={() => setDate(option)} aria-pressed={selected}
                  className={`min-h-14 rounded-lg border px-2 py-2 text-center text-sm transition ${selected ? 'border-warning-600 bg-warning-50 font-semibold text-warning-700' : 'border-border text-text hover:bg-secondary-50'}`}>
                  <span className="block font-semibold">+{extra} night{extra === 1 ? '' : 's'}</span>
                  <span className="block text-xs text-text-muted">to {shortLabel(option)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block text-sm font-semibold text-text">
          Or pick the new departure date
          <span className="mt-1.5 flex min-h-12 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-warning-600 focus-within:ring-2 focus-within:ring-warning-500/20">
            <CalendarDays size={18} className="shrink-0 text-text-muted" />
            <input type="date" required min={earliest} value={date} onChange={(event) => setDate(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-2 text-base font-normal text-text outline-none" />
          </span>
        </label>

        {valid
          ? <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning-700">New departure: <strong>{label(date)}</strong> · adds {nights} night{nights === 1 ? '' : 's'} at the agreed rate.</p>
          : <p className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">Choose a date after {label(current)}.</p>}

        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">Cancel</button>
          <button disabled={!valid || busy} className="min-h-11 rounded-lg bg-warning-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Extending…' : 'Extend stay'}</button>
        </div>
      </form>
    </div>
  );
}
