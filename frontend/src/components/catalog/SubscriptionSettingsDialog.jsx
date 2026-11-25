import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSubscriptionSettings, saveSubscriptionSettings } from '../../api/platformProperties';

const input = 'w-full min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-text';

function Num({ label, value, onChange, step = 1 }) {
  return (
    <label className="block text-xs font-medium text-text-muted">
      {label}
      <input type="number" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={`mt-1 ${input}`} />
    </label>
  );
}

export default function SubscriptionSettingsDialog({ onClose }) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['subscriptionSettings'], queryFn: () => getSubscriptionSettings().then((r) => r.data.data) });
  const [config, setConfig] = useState(null);
  useEffect(() => { if (settings.data && !config) setConfig(structuredClone(settings.data)); }, [settings.data, config]);

  const save = useMutation({
    mutationFn: () => saveSubscriptionSettings(config).then((r) => r.data.data),
    onSuccess: (saved) => {
      queryClient.setQueryData(['subscriptionSettings'], saved);
      toast.success('Subscription settings saved. New prices apply to new purchases only.');
      onClose();
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not save settings.'),
  });

  const set = (path, value) => setConfig((c) => {
    const next = structuredClone(c);
    let target = next;
    path.slice(0, -1).forEach((key) => { target = target[key]; });
    target[path[path.length - 1]] = value;
    return next;
  });

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="sub-settings-title"
        onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}
        className="max-h-[90vh] w-full max-w-3xl space-y-6 overflow-y-auto rounded-xl bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Settings2 size={19} /></span>
            <div>
              <h2 id="sub-settings-title" className="text-lg font-bold text-text">Subscription settings</h2>
              <p className="text-sm text-text-muted">Changes apply to new purchases. Paid periods keep the price they were bought at.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-secondary-50"><X size={18} /></button>
        </div>

        {!config ? <p className="text-sm text-text-muted">{settings.isError ? 'Could not load settings.' : 'Loading…'}</p> : <>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Packages</h3>
              <button type="button" onClick={() => set(['packages'], [...config.packages, { code: '', name: '', monthlyPrice: 0, rooms: 1, staff: 1, active: true }])}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700"><Plus size={14} /> Add package</button>
            </div>
            <div className="space-y-3">
              {config.packages.map((p, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr_auto_auto]">
                  <label className="block text-xs font-medium text-text-muted">Name<input value={p.name} onChange={(e) => set(['packages', i, 'name'], e.target.value)} className={`mt-1 ${input}`} /></label>
                  <label className="block text-xs font-medium text-text-muted">Code<input value={p.code} onChange={(e) => set(['packages', i, 'code'], e.target.value.toLowerCase())} className={`mt-1 ${input}`} /></label>
                  <Num label="GHS / month" value={p.monthlyPrice} step="0.01" onChange={(v) => set(['packages', i, 'monthlyPrice'], v)} />
                  <Num label="Rooms" value={p.rooms} onChange={(v) => set(['packages', i, 'rooms'], v)} />
                  <Num label="Staff" value={p.staff} onChange={(v) => set(['packages', i, 'staff'], v)} />
                  <label className="flex items-center gap-1.5 pb-2 text-xs text-text"><input type="checkbox" checked={p.active} onChange={(e) => set(['packages', i, 'active'], e.target.checked)} /> Offered</label>
                  <button type="button" aria-label={`Remove ${p.name || 'package'}`} onClick={() => set(['packages'], config.packages.filter((_, j) => j !== i))} className="rounded-lg p-2 text-danger-600 hover:bg-danger-50"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-text-muted">Untick "Offered" instead of removing a package hotels currently use.</p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Custom package</h3>
              <label className="flex items-center gap-1.5 text-sm text-text"><input type="checkbox" checked={config.custom.enabled} onChange={(e) => set(['custom', 'enabled'], e.target.checked)} /> Offered</label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="block text-xs font-medium text-text-muted">Name<input value={config.custom.name} onChange={(e) => set(['custom', 'name'], e.target.value)} className={`mt-1 ${input}`} /></label>
              <Num label="Base fee (GHS)" step="0.01" value={config.custom.baseFee} onChange={(v) => set(['custom', 'baseFee'], v)} />
              <Num label="Per room (GHS)" step="0.01" value={config.custom.perRoom} onChange={(v) => set(['custom', 'perRoom'], v)} />
              <Num label="Per staff (GHS)" step="0.01" value={config.custom.perStaff} onChange={(v) => set(['custom', 'perStaff'], v)} />
              <Num label="Min rooms" value={config.custom.minRooms} onChange={(v) => set(['custom', 'minRooms'], v)} />
              <Num label="Max rooms" value={config.custom.maxRooms} onChange={(v) => set(['custom', 'maxRooms'], v)} />
              <Num label="Min staff" value={config.custom.minStaff} onChange={(v) => set(['custom', 'minStaff'], v)} />
              <Num label="Max staff" value={config.custom.maxStaff} onChange={(v) => set(['custom', 'maxStaff'], v)} />
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text">Durations</h3>
              <div className="grid grid-cols-2 gap-2">
                <Num label="Min months" value={config.minMonths} onChange={(v) => set(['minMonths'], v)} />
                <Num label="Max months" value={config.maxMonths} onChange={(v) => set(['maxMonths'], v)} />
              </div>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-text">Free trial</h3>
              <div className="grid grid-cols-3 gap-2">
                <Num label="Days" value={config.trial.days} onChange={(v) => set(['trial', 'days'], v)} />
                <Num label="Rooms" value={config.trial.rooms} onChange={(v) => set(['trial', 'rooms'], v)} />
                <Num label="Staff" value={config.trial.staff} onChange={(v) => set(['trial', 'staff'], v)} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text">Duration discounts</h3>
                <button type="button" onClick={() => set(['discounts'], [...config.discounts, { minMonths: '', percent: 0 }])} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700"><Plus size={14} /> Add</button>
              </div>
              <div className="space-y-2">
                {config.discounts.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <Num label="From months" value={d.minMonths} onChange={(v) => set(['discounts', i, 'minMonths'], v)} />
                    <Num label="Discount %" step="0.01" value={d.percent} onChange={(v) => set(['discounts', i, 'percent'], v)} />
                    <button type="button" aria-label="Remove discount" onClick={() => set(['discounts'], config.discounts.filter((_, j) => j !== i))} className="rounded-lg p-2 text-danger-600 hover:bg-danger-50"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>}

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button>
          <button type="submit" disabled={!config || save.isPending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-text-inverted disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>
    </div>
  );
}
