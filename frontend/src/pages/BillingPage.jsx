import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BedDouble, CalendarClock, CheckCircle2, Crown, Gift, Lightbulb, Loader2, Minus, Plus, ShieldCheck, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { fetchSubscriptionQuote, fetchSubscriptionStatus, initializeSubscriptionPayment } from '../api/billing';
import SubscriptionMomoPanel from '../components/billing/SubscriptionMomoPanel';
import { currentFreeAccess, describeFreeAccess } from '../lib/freeAccess';

const money = (n) => `GHS ${Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const date = (v) => (v ? new Date(v).toLocaleDateString('en-GH', { dateStyle: 'long', timeZone: 'Africa/Accra' }) : '—');
const QUICK_MONTHS = [1, 3, 6, 12, 24];
const KIND_LABEL = { New: 'New plan', Renewal: 'Renewal', Upgrade: 'Upgrade', Downgrade: 'Plan change at renewal' };

function useDebounced(value, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return debounced;
}

function UsageMeter({ icon: Icon, label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = used > limit ? 'bg-danger-500' : pct >= 90 ? 'bg-warning-500' : 'bg-primary-500';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-text"><Icon size={15} className="text-text-muted" /> {label}</span>
        <span className="text-text-muted"><b className="text-text">{used}</b> of {limit}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary-100"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
      {used >= limit && <p className="mt-1 text-xs text-warning-700">Limit reached — existing {label.toLowerCase()} keep working, but you can't add more.</p>}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }) {
  // Keep the typed text separately so the field can be cleared and retyped freely;
  // only whole numbers in range update the plan, and leaving the field restores a valid value.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const clamp = (n) => Math.max(min, Math.min(max, Math.round(n)));
  const set = (n) => onChange(clamp(Number.isFinite(n) ? n : min));
  const type = (text) => {
    const digits = text.replace(/\D/g, '');
    setDraft(digits);
    const n = Number(digits);
    if (digits && n >= min && n <= max) onChange(n);
  };
  const out = draft !== '' && (Number(draft) < min || Number(draft) > max);
  return (
    <label className="block text-sm font-medium text-text">
      {label}
      <div className={`mt-1 flex items-center rounded-lg border bg-background ${out ? 'border-warning-500' : 'border-border'}`}>
        <button type="button" aria-label={`Fewer ${label}`} onClick={() => set(value - 1)} className="p-2 text-text-muted hover:text-text"><Minus size={14} /></button>
        <input type="text" inputMode="numeric" value={draft} placeholder={String(min)}
          onChange={(e) => type(e.target.value)}
          onBlur={() => { const n = Number(draft); const next = draft === '' ? value : clamp(n); setDraft(String(next)); if (next !== value) onChange(next); }}
          className="w-full min-w-0 bg-transparent text-center text-text outline-none" />
        <button type="button" aria-label={`More ${label}`} onClick={() => set(value + 1)} className="p-2 text-text-muted hover:text-text"><Plus size={14} /></button>
      </div>
      <span className="text-xs font-normal text-text-muted">{min}–{max}</span>
    </label>
  );
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const initRef = useRef(false);
  const [selection, setSelection] = useState({ packageCode: 'standard', rooms: 20, staff: 5, months: 1 });
  const [upgradeOnly, setUpgradeOnly] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const userPhone = useAuthStore((s) => s.user?.phone);
  const [showMomo, setShowMomo] = useState(() => { try { return Boolean(localStorage.getItem('billing-pending-payment')); } catch { return false; } });

  const status = useQuery({
    queryKey: ['subscriptionStatus'],
    queryFn: () => fetchSubscriptionStatus().then((r) => r.data.data),
  });
  const data = status.data;

  // Keep the signed-in user's subscription fields (used by sidebar/dashboard) in sync.
  useEffect(() => {
    if (!data) return;
    const { subscriptionPlan, subscriptionStatus, trialEndsAt, subscriptionEndsAt } = data;
    useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, subscriptionPlan, subscriptionStatus, trialEndsAt, subscriptionEndsAt } : s.user }));
    if (initRef.current) return;
    initRef.current = true;
    const target = data.scheduled || data.current;
    // Start on the hotel's own plan when it still fits, otherwise the first plan that does.
    const fitting = data.catalog.packages.filter((p) => p.rooms >= data.usage.rooms && p.staff >= data.usage.staff);
    const own = fitting.find((p) => p.code === target.packageCode && p.rooms === target.roomAllowance && p.staff === target.staffAllowance);
    setSelection((s) => ({
      ...s,
      packageCode: target.packageCode === 'custom' ? 'custom' : own?.code || fitting[0]?.code || (data.catalog.custom ? 'custom' : target.packageCode),
      rooms: Math.max(target.roomAllowance, data.usage.rooms, data.catalog.custom?.minRooms || 1),
      staff: Math.max(target.staffAllowance, data.usage.staff, data.catalog.custom?.minStaff || 1),
      months: Math.max(1, data.catalog.minMonths),
    }));
  }, [data]);

  const isCustom = selection.packageCode === 'custom';
  const params = useDebounced({
    packageCode: selection.packageCode,
    ...(isCustom ? { rooms: selection.rooms, staff: selection.staff } : {}),
    months: upgradeOnly ? 0 : selection.months,
  });
  const quote = useQuery({
    queryKey: ['subscriptionQuote', params],
    queryFn: () => fetchSubscriptionQuote(params).then((r) => r.data.data),
    enabled: !!data && initRef.current,
    retry: false,
    placeholderData: (prev) => prev,
  });
  const quoteError = quote.isError ? quote.error?.response?.data?.message || 'Could not price this option.' : null;
  const q = quote.isError ? null : quote.data;

  if (status.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }
  if (status.isError || !data) {
    return <div className="mx-auto max-w-xl rounded-xl border border-danger-200 bg-danger-50 p-6 text-danger-700">{status.error?.response?.data?.message || 'Could not load billing details.'}</div>;
  }

  const { state, current, scheduled, usage, limits, catalog } = data;
  const paidActive = data.subscriptionStatus === 'Active' && !state.expired;
  const statusTone = state.expired ? 'bg-danger-50 text-danger-700' : state.isTrial ? 'bg-primary-50 text-primary-700' : 'bg-success-50 text-success-700';
  const statusLabel = state.cancelled ? 'Cancelled' : state.expired ? 'Expired' : state.isTrial ? 'Free trial' : 'Active';
  const choose = (packageCode) => { setSelection((s) => ({ ...s, packageCode })); setUpgradeOnly(false); };
  const canUpgradeOnly = paidActive && !scheduled && q?.kind === 'Upgrade';

  const pay = async () => {
    // Paid changes go through mobile money; a free change (total 0) is applied directly.
    if (q && q.total > 0) { setShowMomo(true); return; }
    setIsPaying(true);
    try {
      const res = await initializeSubscriptionPayment(params);
      if (!res.data.data?.applied) throw new Error('Could not apply the change.');
      toast.success('Plan updated — no payment was needed.');
      queryClient.invalidateQueries({ queryKey: ['subscriptionStatus'] });
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not start the payment.');
    }
    setIsPaying(false);
  };
  const momoDone = () => {
    setShowMomo(false);
    toast.success('Payment confirmed. Your plan is updated.');
    queryClient.invalidateQueries({ queryKey: ['subscriptionStatus'] });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">Billing & Plan</h1>
        <p className="mt-1 text-text-muted">Every plan includes all HideOut24 features. Plans differ only in rooms and staff accounts.</p>
      </div>

      {/* Current plan */}
      <section className="grid gap-6 rounded-xl border border-border bg-surface p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Crown size={18} className="text-primary-600" />
            <h2 className="text-xl font-bold text-text">{current.packageName}</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
          </div>
          <p className="text-sm font-medium text-text">Your allowance: {current.roomAllowance} rooms · {current.staffAllowance} staff accounts</p>
          <p className="text-sm text-text-muted">
            {state.expired ? `Ended ${date(state.endsAt)}. Your data is safe — renew to continue making changes and taking online bookings.`
              : `${state.isTrial ? 'Trial ends' : 'Paid until'} ${date(state.endsAt)}.`}
          </p>
          {scheduled && (
            <p className="flex items-start gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
              <CalendarClock size={16} className="mt-0.5 shrink-0" />
              Switching to {scheduled.packageName} ({scheduled.roomAllowance} rooms, {scheduled.staffAllowance} staff) on {date(scheduled.effectiveAt)}.
            </p>
          )}
          {data.hotelDiscountPercent > 0 && <p className="text-sm text-success-700">Your hotel has a {data.hotelDiscountPercent}% special discount, included in all prices below.</p>}
          {currentFreeAccess(data.freeAccess).map((grant) => (
            <p key={grant.endsAt} className="flex items-center gap-1.5 text-sm text-success-700"><Gift size={14} /> {describeFreeAccess(grant)}</p>
          ))}
        </div>
        <div className="space-y-4">
          <UsageMeter icon={BedDouble} label="Rooms" used={usage.rooms} limit={limits.rooms} />
          <UsageMeter icon={Users} label="Staff accounts" used={usage.staff} limit={limits.staff} />
          <p className="text-xs text-text-muted">Staff includes managers and pending invitations.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Packages */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-text">Choose a plan</h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
              {catalog.packages.map((p) => {
                const short = [p.rooms < usage.rooms && `${usage.rooms} rooms`, p.staff < usage.staff && `${usage.staff} staff accounts`].filter(Boolean);
                const isCurrent = current.packageCode === p.code && current.roomAllowance === p.rooms && current.staffAllowance === p.staff;
                return (
                  <button key={p.code} type="button" onClick={() => choose(p.code)} disabled={short.length > 0} aria-pressed={selection.packageCode === p.code}
                    className={`rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:bg-secondary-50 disabled:opacity-70 ${selection.packageCode === p.code && !short.length ? 'border-primary-500 bg-primary-50' : 'border-border hover:border-primary-200'}`}>
                    <p className="font-semibold text-text">{p.name}</p>
                    <p className="mt-1 text-xl font-bold text-text">{money(p.monthlyPrice)}<span className="text-sm font-normal text-text-muted">/mo</span></p>
                    <p className="mt-2 text-sm text-text-muted">{p.rooms} rooms · {p.staff} staff</p>
                    {short.length > 0
                      ? <p className="mt-2 text-xs font-medium text-warning-700">Too small — you have {short.join(' and ')}</p>
                      : isCurrent && <p className="mt-2 text-xs font-semibold text-primary-700">Current plan</p>}
                  </button>
                );
              })}
              {catalog.custom && (
                <button type="button" onClick={() => choose('custom')}
                  className={`rounded-xl border-2 p-4 text-left transition ${isCustom ? 'border-primary-500 bg-primary-50' : 'border-border hover:border-primary-200'}`}>
                  <p className="font-semibold text-text">{catalog.custom.name}</p>
                  <p className="mt-1 text-sm text-text-muted">{money(catalog.custom.baseFee)} base + {money(catalog.custom.perRoom)}/room + {money(catalog.custom.perStaff)}/staff per month</p>
                  <p className="mt-2 text-sm text-text-muted">Pick exactly what you need</p>
                  {current.packageCode === 'custom' && <p className="mt-2 text-xs font-semibold text-primary-700">Current plan</p>}
                </button>
              )}
            </div>
            {isCustom && catalog.custom && (
              <div className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
                <Stepper label="Rooms" value={selection.rooms} min={Math.max(catalog.custom.minRooms, usage.rooms)} max={catalog.custom.maxRooms} onChange={(rooms) => setSelection((s) => ({ ...s, rooms }))} />
                <Stepper label="Staff accounts" value={selection.staff} min={Math.max(catalog.custom.minStaff, usage.staff)} max={catalog.custom.maxStaff} onChange={(staff) => setSelection((s) => ({ ...s, staff }))} />
              </div>
            )}
          </section>

          {/* Duration */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-text">How long?</h2>
              <span className="text-sm text-text-muted">{upgradeOnly ? 'Remaining period only' : `${selection.months} month${selection.months > 1 ? 's' : ''}`}</span>
            </div>
            <input type="range" min={catalog.minMonths} max={catalog.maxMonths} value={selection.months} disabled={upgradeOnly}
              onChange={(e) => setSelection((s) => ({ ...s, months: Number(e.target.value) }))} className="w-full accent-primary-600" aria-label="Duration in months" />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_MONTHS.filter((m) => m >= catalog.minMonths && m <= catalog.maxMonths).map((m) => {
                const pct = [...catalog.discounts].reverse().find((d) => m >= d.minMonths)?.percent || 0;
                return (
                  <button key={m} type="button" disabled={upgradeOnly} onClick={() => setSelection((s) => ({ ...s, months: m }))}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${!upgradeOnly && selection.months === m ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border text-text hover:bg-secondary-50'}`}>
                    {m} mo{pct > 0 && <span className="ml-1 font-semibold text-success-700">−{pct}%</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Discounts: {catalog.discounts.filter((d) => d.percent > 0).map((d) => `${d.minMonths}+ months ${d.percent}%`).join(' · ') || 'none'}
            </p>
            {(canUpgradeOnly || upgradeOnly) && (
              <label className="mt-3 flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={upgradeOnly} onChange={(e) => setUpgradeOnly(e.target.checked)} className="accent-primary-600" />
                Upgrade now for the remaining period only (no extra months)
              </label>
            )}
          </section>
        </div>

        {/* Breakdown */}
        <aside className="h-fit rounded-xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-4">
          <h2 className="mb-3 text-lg font-bold text-text">Summary</h2>
          {quoteError ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning-50 p-3 text-sm text-warning-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {quoteError}</p>
          ) : !q ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-primary-500" /></div>
          ) : (
            <div className={`space-y-3 text-sm ${quote.isFetching ? 'opacity-60' : ''}`}>
              <div>
                <p className="font-semibold text-text">{q.packageName} · {KIND_LABEL[q.kind]}</p>
                <p className="text-text-muted">{q.roomAllowance} rooms · {q.staffAllowance} staff accounts</p>
              </div>
              <dl className="space-y-1.5 border-t border-border pt-3">
                {q.months > 0 && <>
                  <Row label={`${money(q.monthlyPrice)} × ${q.months} month${q.months > 1 ? 's' : ''}`} value={money(q.subtotal)} />
                  {q.discountAmount > 0 && <Row label={`Duration discount (${q.discountPercent}%)`} value={`−${money(q.discountAmount)}`} tone="text-success-700" />}
                </>}
                {q.prorationAmount > 0 && <Row label={`Upgrade difference (${q.remainingDays} days left)`} value={money(q.prorationAmount)} />}
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-text"><dt>Total today</dt><dd>{money(q.total)}</dd></div>
                {q.months > 0 && <Row label="Effective monthly cost" value={money(q.effectiveMonthly)} />}
                {q.discountAmount > 0 && <Row label="You save" value={money(q.discountAmount)} tone="text-success-700" />}
              </dl>
              <p className="rounded-lg bg-background p-3 text-text-muted">
                {q.kind === 'Downgrade'
                  ? `New allowances start ${date(q.appliesAt)}, when your current period ends. ${q.months ? `Paid until ${date(q.endsAt)}.` : ''}`
                  : q.kind === 'Upgrade'
                    ? `New allowances apply immediately. ${q.endsAt ? `Paid until ${date(q.endsAt)}.` : ''}`
                    : `${q.startsAt && new Date(q.startsAt) > new Date() ? `Starts after your current period, ${date(q.startsAt)}.` : 'Starts today.'} Paid until ${date(q.endsAt)}.`}
              </p>
              {q.recommendation && (
                <div className="rounded-lg border border-success-200 bg-success-50 p-3 text-success-800">
                  <p className="flex items-center gap-1.5 font-semibold"><Lightbulb size={15} /> Save {money(q.recommendation.monthlySaving)}/month</p>
                  <p className="mt-1">{q.recommendation.packageName} ({q.recommendation.roomAllowance} rooms, {q.recommendation.staffAllowance} staff) covers this for {money(q.recommendation.monthlyPrice)}/month.</p>
                  <button type="button" onClick={() => setSelection((s) => ({ ...s, packageCode: q.recommendation.packageCode, rooms: q.recommendation.roomAllowance, staff: q.recommendation.staffAllowance }))}
                    className="mt-2 font-semibold underline">Switch to {q.recommendation.packageName}</button>
                </div>
              )}
            </div>
          )}
          {showMomo ? (
            <SubscriptionMomoPanel params={params} amountLabel={q ? money(q.total) : ''} defaultPhone={userPhone} onApplied={momoDone} onCancel={() => setShowMomo(false)} />
          ) : <>
          <button type="button" onClick={pay} disabled={!q || !!quoteError || isPaying || quote.isFetching}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 font-semibold text-text-inverted transition hover:bg-primary-700 disabled:opacity-50">
            {isPaying ? <><Loader2 size={18} className="animate-spin" /> Applying…</> : quoteError ? 'Choose a plan that fits' : !q ? 'Pay' : q.total === 0 ? 'Apply change' : `Pay ${money(q.total)}`}
          </button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-text-muted"><ShieldCheck size={13} /> Mobile money (MTN, Telecel, AT) via Moolre. No automatic renewals.</p>
          </>}
        </aside>
      </div>

      {/* History */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-text">Payment history</h2>
        {data.payments.length === 0 ? <p className="text-sm text-text-muted">No subscription payments yet.</p> : (
          <ul className="divide-y divide-border text-sm">
            {data.payments.map((p) => (
              <li key={p.reference} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex items-center gap-2 text-text"><CheckCircle2 size={15} className="text-success-600" /> {p.packageCode === 'legacy' ? 'Original plan' : p.planName} · {KIND_LABEL[p.kind] || p.kind}{p.durationMonths ? ` · ${p.durationMonths} mo` : ''}{p.roomAllowance ? ` · ${p.roomAllowance} rooms / ${p.staffAllowance} staff` : ''}</span>
                <span className="text-text-muted">{date(p.paidAt)} · <b className="text-text">{money(p.amount)}</b></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, tone = 'text-text' }) {
  return <div className="flex justify-between gap-3"><dt className="text-text-muted">{label}</dt><dd className={`font-medium ${tone}`}>{value}</dd></div>;
}
