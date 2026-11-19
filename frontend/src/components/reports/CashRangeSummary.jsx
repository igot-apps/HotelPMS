import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote } from 'lucide-react';
import api from '../../lib/axios';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (value) => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${cash(Math.abs(Number(value || 0)))}`;
const tone = (value) => (Number(value) === 0 ? 'text-success-700' : Number(value) < 0 ? 'text-danger-700' : 'text-warning-700');

// Cash over a period: per person, expected cash on all days, and the difference on the days that were counted.
// Uncounted days are listed separately (never treated as a shortage). Pick a single day below to record counts.
export default function CashRangeSummary({ from, to }) {
  const section = useRef(null);
  const { data, isPending, error } = useQuery({
    queryKey: ['cashRecon', from, to],
    queryFn: async () => (await api.get('/dashboard/cash', { params: { from, to }, skipErrorToast: true })).data.data,
  });
  useEffect(() => { if (data && window.location.hash === '#cash') section.current?.scrollIntoView({ block: 'start' }); }, [data]);
  const t = data?.totals;
  return (
    <section ref={section} id="cash" aria-labelledby="cash-range-title" className="scroll-mt-4 space-y-4 rounded-xl border border-border bg-surface p-5 text-text">
      <div>
        <h2 id="cash-range-title" className="flex items-center gap-2 text-xl font-bold"><Banknote size={20} className="text-primary-600" /> Cash · {from} to {to}</h2>
        <p className="mt-1 text-sm text-text-muted">Differences are added up only for days that were counted. Days with cash but no count are listed as not counted — they are not shortages.</p>
      </div>
      {isPending && <p role="status">Loading cash for this period…</p>}
      {error && <p role="alert" className="text-danger-700">{error.response?.data?.message || 'Could not load cash for this period.'}</p>}
      {data && t && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label="Expected cash (all days)" value={cash(t.expectedCash)} />
          <Figure label="Counted (counted days only)" value={cash(t.countedCash)} hint={`against ${cash(t.expectedOnCountedDays)} expected on those days`} />
          <Figure label="Shortage / overage (counted days)" value={signed(t.differenceOnCountedDays)} valueClass={tone(t.differenceOnCountedDays)} hint={`${t.countedPersonDays} counted · ${t.uncountedPersonDays} not counted (person-days)`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-border text-text-muted">{['Staff', 'Expected cash', 'Counted days', 'Difference (counted days)', 'Not counted'].map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {!data.staff.length && <tr><td colSpan="5" className="p-3 text-text-muted">No cash was handled at the desk in this period.</td></tr>}
              {data.staff.map((row) => (
                <tr key={row.userId} className="border-b border-border align-top">
                  <td className="p-2 font-semibold">{row.name}</td>
                  <td className="p-2">{cash(row.expectedCash)}</td>
                  <td className="p-2">{row.countedDays} of {row.days.length}</td>
                  <td className={`p-2 font-semibold ${row.countedDays ? tone(row.differenceOnCountedDays) : 'text-text-muted'}`}>{row.countedDays ? signed(row.differenceOnCountedDays) : '—'}</td>
                  <td className="p-2">{row.uncountedDays.length ? row.uncountedDays.map((day) => (
                    <span key={day} className="mb-1 mr-1 inline-block rounded-md border border-border px-2 py-0.5 text-xs">{day}</span>
                  )) : <span className="text-text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-muted">Tap a date to open that day below, where counts can be recorded and every entry is listed.</p>
      </>}
    </section>
  );
}

function Figure({ label, value, hint, valueClass = '' }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
