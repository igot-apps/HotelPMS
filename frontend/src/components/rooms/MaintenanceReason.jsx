import { useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';

export const MAINTENANCE_REASONS = [
  'Plumbing repair',
  'Electrical fault',
  'Air conditioning repair',
  'Furniture or fixture repair',
  'Deep cleaning',
  'Pest control',
  'Painting or renovation',
];
const OTHER = 'other';
const fieldClass = 'mt-1.5 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

// Reason picker: a preset list plus "Other" for a custom reason. Reports the final text (or '').
export function MaintenanceReasonField({ onChange, disabled }) {
  const [choice, setChoice] = useState('');
  const [custom, setCustom] = useState('');
  const report = (nextChoice, nextCustom) => onChange(nextChoice === OTHER ? nextCustom.trim() : nextChoice);
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-text">Reason for maintenance
        <select required value={choice} disabled={disabled} onChange={(event) => { setChoice(event.target.value); report(event.target.value, custom); }} className={fieldClass}>
          <option value="">Choose a reason…</option>
          {MAINTENANCE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          <option value={OTHER}>Other (type a reason)</option>
        </select>
      </label>
      {choice === OTHER && (
        <label className="block text-sm font-medium text-text">Describe the reason
          <input required autoFocus minLength={3} maxLength={200} value={custom} disabled={disabled} onChange={(event) => { setCustom(event.target.value); report(OTHER, event.target.value); }} placeholder="e.g. Broken window" className={fieldClass} />
        </label>
      )}
    </div>
  );
}

export const isValidMaintenanceReason = (reason) => reason.trim().length >= 3 && reason.trim().length <= 200;

export function MaintenanceReasonDialog({ room, onConfirm, onClose, busy }) {
  const [reason, setReason] = useState('');
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-title"
        onSubmit={(event) => { event.preventDefault(); if (!busy && isValidMaintenanceReason(reason)) onConfirm(reason.trim()); }}
        className="w-full max-w-md space-y-4 rounded-xl bg-surface p-6 shadow-xl"
      >
        <h2 id="maintenance-title" className="flex items-center gap-2 text-lg font-bold text-text"><Wrench size={19} className="text-danger-600" /> Set Room {room.roomNumber} to maintenance</h2>
        <p className="text-sm text-text-muted">The room can't be booked online or at the front desk until it is set back to available.</p>
        <MaintenanceReasonField onChange={setReason} disabled={busy} />
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || !isValidMaintenanceReason(reason)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" />} Set maintenance
          </button>
        </div>
      </form>
    </div>
  );
}
