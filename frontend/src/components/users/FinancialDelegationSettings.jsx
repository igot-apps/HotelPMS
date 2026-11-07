export const financialOptions = [
  ['correct-date', 'Shorten a stay or reduce charges', 'Maximum charge reduction per correction (GHS)', 'Extensions at the agreed rate are always direct. Reductions within this limit can be applied directly.'],
  ['credit-checkout', 'Checkout with an unpaid balance', 'Maximum outstanding booking balance (GHS)', 'The unpaid balance stays on the reservation for collection.'],
];
export default function FinancialDelegationSettings({ value, onChange, disabled }) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-3"><legend className="mb-2 font-semibold text-text">Financial actions</legend><p className="text-sm text-text-muted">Receptionists can correct their own manual payments recorded today up to GHS 100. Voids and larger corrections need approval. For the actions below, uncheck and set a limit to allow more.</p>
    <div className="grid gap-3 lg:grid-cols-2">
      {financialOptions.map(([action, label, limitLabel, description]) => { const enabled = Object.hasOwn(value, action); return <div key={action} className="min-w-0 space-y-3 rounded-lg border border-border p-3"><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text"><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary-600" checked={!enabled} onChange={e => { const next = { ...value }; if (e.target.checked) delete next[action]; else next[action] = ''; onChange(next); }} /><span><span className="block font-medium">{label}</span><span className="mt-1 block text-xs text-text-muted">{enabled ? 'Allowed within the limit below' : 'Manager approval required'}</span></span></label>{enabled && <div className="space-y-2 pl-7"><label className="block text-sm text-text">{limitLabel}<input required type="number" min="0.01" max="99999999.99" step="0.01" value={value[action]} onChange={e => onChange({ ...value, [action]: e.target.value })} className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background p-2" /></label><p className="text-xs text-text-muted">{description}</p></div>}</div>; })}
      <p className="flex min-h-16 items-center rounded-lg border border-border bg-background p-3 text-sm text-text">🔒 Approve refunds — manager approval always required.</p>
    </div>
  </fieldset>;
}
