import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getFreeAccess, grantFreeAccess } from '../../api/platformProperties';
import { describeFreeAccess, formatFreeAccessDate } from '../../lib/freeAccess';

const presets = [7, 14, 30, 90];

export default function FreeAccessDialog({ property, onClose }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);

  const history = useQuery({
    queryKey: ['freeAccess', property.propertyId],
    queryFn: () => getFreeAccess(property.propertyId).then((response) => response.data.data || []),
  });

  const previewMutation = useMutation({
    mutationFn: () => grantFreeAccess(property.propertyId, { days, reason }).then((response) => response.data.data),
    onSuccess: setPreview,
    onError: (error) => toast.error(error.response?.data?.message || 'Could not preview free access.'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => grantFreeAccess(property.propertyId, { days, reason, expectedVersion: preview.version }).then((response) => response.data.data),
    onSuccess: (grant) => {
      queryClient.invalidateQueries({ queryKey: ['platformProperties'] });
      queryClient.invalidateQueries({ queryKey: ['freeAccess', property.propertyId] });
      toast.success(`${describeFreeAccess(grant)} granted to ${property.propertyName}.`);
      onClose();
    },
    onError: (error) => {
      setPreview(null);
      toast.error(error.response?.data?.message || 'Could not grant free access.');
    },
  });

  const busy = previewMutation.isPending || confirmMutation.isPending;
  const setDaysValue = (value) => { setDays(value); setPreview(null); };
  const setReasonValue = (value) => { setReason(value); setPreview(null); };
  const valid = Number.isInteger(days) && days >= 1 && days <= 365 && reason.trim().length > 0 && reason.length <= 300;

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-access-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !valid) return;
          if (preview) confirmMutation.mutate(); else previewMutation.mutate();
        }}
        className="max-h-[90vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-xl bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-600"><Gift size={19} /></span>
            <div>
              <h2 id="free-access-title" className="text-lg font-bold text-text">Grant free access</h2>
              <p className="text-sm text-text-muted">{property.propertyName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-secondary-50"><X size={18} /></button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-text">Duration</p>
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDaysValue(value)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${days === value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border text-text hover:bg-secondary-50'}`}
              >
                {value} days
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input
                type="number"
                min="1"
                max="365"
                value={days}
                onChange={(event) => setDaysValue(Number(event.target.value))}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-text"
              />
              days
            </label>
          </div>
        </div>

        <label className="block text-sm font-medium text-text">
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReasonValue(event.target.value)}
            maxLength={300}
            rows={2}
            placeholder="e.g. Launch partner, compensation for downtime"
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal text-text"
          />
        </label>

        {preview && (
          <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-800">
            <p className="font-semibold">{describeFreeAccess(preview)}</p>
            <p className="mt-1">
              {new Date(preview.startsAt) > new Date()
                ? 'The free days start after the current paid period ends.'
                : 'Access starts immediately.'} No payment or charge is involved.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || !valid} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-50">
            {busy ? 'Working…' : preview ? 'Confirm grant' : 'Preview end date'}
          </button>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold text-text">History</h3>
          {history.isLoading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : history.isError ? (
            <p className="text-sm text-danger-600">Could not load free access history.</p>
          ) : history.data.length === 0 ? (
            <p className="text-sm text-text-muted">No free access granted yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.data.map((entry) => (
                <li key={entry.auditLogId} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <p className="font-medium text-text">
                    {entry.newData?.days} days · {formatFreeAccessDate(entry.newData?.startsAt)} – {formatFreeAccessDate(entry.newData?.endsAt)}
                  </p>
                  <p className="text-text-muted">{entry.newData?.reason}</p>
                  <p className="mt-0.5 text-xs text-text-muted">By {entry.user?.fullName || 'Unknown'} on {formatFreeAccessDate(entry.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </div>
  );
}
