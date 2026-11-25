import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getPropertySubscription, setSubscriptionOverride } from '../../api/platformProperties';

const money = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { maximumFractionDigits: 2 })}`;
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const input = 'mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-text';
const ACTIONS = { SubscriptionPurchased: 'Plan purchase', SubscriptionOverrideChanged: 'Override changed', FreeSubscriptionAccessGranted: 'Free access' };

function describe(entry) {
  const d = entry.newData || {};
  if (entry.action === 'SubscriptionPurchased') {
    const from = entry.oldData ? `${entry.oldData.packageName} (${entry.oldData.roomAllowance}/${entry.oldData.staffAllowance})` : '';
    return `${d.kind}: ${from} → ${d.packageName} (${d.roomAllowance} rooms/${d.staffAllowance} staff) · ${money(d.amount)}${d.months ? ` · ${d.months} mo` : ''} · applies ${day(d.appliesAt)}`;
  }
  if (entry.action === 'SubscriptionOverrideChanged') {
    return d.cleared ? 'Overrides cleared' : [d.discountPercent && `${d.discountPercent}% discount`, d.roomAllowance && `${d.roomAllowance} rooms`, d.staffAllowance && `${d.staffAllowance} staff`, d.note].filter(Boolean).join(' · ');
  }
  return `${d.days} days until ${day(d.endsAt)} · ${d.reason || ''}`;
}

export default function HotelSubscriptionDialog({ property, onClose }) {
  const queryClient = useQueryClient();
  const key = ['propertySubscription', property.propertyId];
  const view = useQuery({ queryKey: key, queryFn: () => getPropertySubscription(property.propertyId).then((r) => r.data.data) });
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (view.data && !form) {
      const o = view.data.override || {};
      setForm({ discountPercent: o.discountPercent ?? '', roomAllowance: o.roomAllowance ?? '', staffAllowance: o.staffAllowance ?? '', note: o.note ?? '' });
    }
  }, [view.data, form]);

  const save = useMutation({
    mutationFn: () => setSubscriptionOverride(property.propertyId, form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: key }); toast.success('Hotel overrides saved.'); },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not save overrides.'),
  });

  const d = view.data;
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="hotel-sub-title" className="max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-xl bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Crown size={19} /></span>
            <div>
              <h2 id="hotel-sub-title" className="text-lg font-bold text-text">Subscription</h2>
              <p className="text-sm text-text-muted">{property.propertyName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-secondary-50"><X size={18} /></button>
        </div>

        {view.isLoading ? <p className="text-sm text-text-muted">Loading…</p> : view.isError ? <p className="text-sm text-danger-600">Could not load subscription.</p> : <>
          <div className="grid gap-3 rounded-lg border border-border p-4 text-sm sm:grid-cols-2">
            <p><span className="text-text-muted">Plan:</span> <b className="text-text">{d.current.packageName}</b> · {d.subscriptionStatus}{d.state.expired ? ' (expired)' : ''}</p>
            <p><span className="text-text-muted">Ends:</span> {day(d.state.endsAt)}</p>
            <p><span className="text-text-muted">Rooms:</span> {d.usage.rooms} used / {d.limits.rooms} allowed</p>
            <p><span className="text-text-muted">Staff:</span> {d.usage.staff} used / {d.limits.staff} allowed</p>
            <p><span className="text-text-muted">Locked price:</span> {money(d.current.monthlyPrice)}/mo{d.current.discountPercent ? ` (−${d.current.discountPercent}%)` : ''}</p>
            {d.scheduled && <p><span className="text-text-muted">Scheduled:</span> {d.scheduled.packageName} on {day(d.scheduled.effectiveAt)}</p>}
          </div>

          {form && (
            <form onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }} className="space-y-3">
              <h3 className="text-sm font-semibold text-text">Hotel-specific overrides</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium text-text-muted">Discount on all prices (%)<input type="number" step="0.01" min="0" max="90" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} className={input} /></label>
                <label className="text-xs font-medium text-text-muted">Room allowance override<input type="number" min="1" value={form.roomAllowance} onChange={(e) => setForm({ ...form, roomAllowance: e.target.value })} className={input} /></label>
                <label className="text-xs font-medium text-text-muted">Staff allowance override<input type="number" min="1" value={form.staffAllowance} onChange={(e) => setForm({ ...form, staffAllowance: e.target.value })} className={input} /></label>
              </div>
              <label className="block text-xs font-medium text-text-muted">Note<input maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} placeholder="Why this hotel has special terms" /></label>
              <p className="text-xs text-text-muted">Leave a field empty to use the purchased plan. Allowance overrides replace the plan's limits until cleared.</p>
              <div className="flex justify-end"><button type="submit" disabled={save.isPending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save overrides'}</button></div>
            </form>
          )}

          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold text-text">Payment history</h3>
            {d.allPayments.length === 0 ? <p className="text-sm text-text-muted">No payments.</p> : (
              <ul className="space-y-1.5 text-sm">
                {d.allPayments.map((p) => (
                  <li key={p.subscriptionPaymentId} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="text-text">{p.packageCode === 'legacy' ? 'Original plan' : p.planName} · {p.kind}{p.durationMonths ? ` · ${p.durationMonths} mo` : ''}{p.roomAllowance ? ` · ${p.roomAllowance}/${p.staffAllowance}` : ''}</span>
                    <span className="text-text-muted">{day(p.paidAt || p.createdAt)} · {money(p.amount)} · <b className={p.status === 'Completed' ? 'text-success-700' : p.status === 'Failed' ? 'text-danger-600' : 'text-warning-700'}>{p.status}</b></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold text-text">Plan change history</h3>
            {d.history.length === 0 ? <p className="text-sm text-text-muted">No changes yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {d.history.map((h) => (
                  <li key={h.auditLogId} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-medium text-text">{ACTIONS[h.action] || h.action}</p>
                    <p className="text-text-muted">{describe(h)}</p>
                    <p className="text-xs text-text-muted">By {h.user?.fullName || 'System'} on {day(h.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>}
      </div>
    </div>
  );
}
