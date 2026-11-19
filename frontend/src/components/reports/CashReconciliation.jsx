import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Banknote, Loader2 } from 'lucide-react';
import api from '../../lib/axios';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (value) => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${cash(Math.abs(Number(value || 0)))}`;
const when = (value) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const tone = (value) => (value === null || value === undefined ? 'text-text-muted' : Number(value) === 0 ? 'text-success-700' : Number(value) < 0 ? 'text-danger-700' : 'text-warning-700');

// Manager's end-of-day cash check for one date: expected vs counted per staff member, with the
// other money (desk MoMo/card, verified online, refunds, money owed) shown separately.
export default function CashReconciliation({ date }) {
  const queryClient = useQueryClient();
  const [counting, setCounting] = useState(null); // staff row being counted
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const { data, isPending, error } = useQuery({
    queryKey: ['cashRecon', date || 'today'],
    queryFn: async () => (await api.get('/dashboard/cash', { params: date ? { date } : {}, skipErrorToast: true })).data.data,
  });
  const save = useMutation({
    mutationFn: async () => (await api.post('/dashboard/cash-counts', { date: data.date, staffUserId: counting.userId, countedAmount: Number(amount), note }, { skipErrorToast: true })).data.data,
    onSuccess: () => { toast.success('Cash count saved.'); setCounting(null); setAmount(''); setNote(''); queryClient.invalidateQueries({ queryKey: ['cashRecon'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save the cash count.'),
  });
  const valid = amount !== '' && /^\d+(\.\d{1,2})?$/.test(amount);
  const t = data?.totals;

  return (
    <section id="cash" aria-labelledby="cash-title" className="scroll-mt-4 space-y-4 rounded-xl border border-border bg-surface p-5 text-text">
      <div>
        <h2 id="cash-title" className="flex items-center gap-2 text-xl font-bold"><Banknote size={20} className="text-primary-600" /> Cash reconciliation</h2>
        <p className="mt-1 text-sm text-text-muted">Expected cash = cash payments taken at the desk minus cash refunds returned, per staff member. Saved counts keep the figures as they were when counted.</p>
      </div>
      {isPending && <p role="status">Loading cash reconciliation…</p>}
      {error && <p role="alert" className="text-danger-700">{error.response?.data?.message || 'Could not load the cash reconciliation.'}</p>}
      {data && t && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label="Expected cash (all staff)" value={cash(t.expectedCash)} />
          <Figure label="Cash counted" value={t.countedCash === null ? 'Not counted yet' : cash(t.countedCash)} hint={t.countedCash === null ? '' : `against ${cash(t.expectedForCounted)} expected for those counted`} />
          <Figure label="Shortage / overage" value={t.difference === null ? '—' : signed(t.difference)} valueClass={tone(t.difference)} hint={t.notCounted.length ? `Not counted: ${t.notCounted.join(', ')}` : ''} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Figure small label="Desk Mobile Money" value={cash(t.deskMobileMoney)} />
          <Figure small label="Desk card" value={cash(t.deskCard)} />
          <Figure small label="Verified online (Paystack)" value={cash(t.verifiedOnline)} />
          <Figure small label="Refunds returned" value={cash(t.refundsReturned)} />
          <Figure small label="Money guests owe (not missing cash)" value={cash(t.outstandingBalances)} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b border-border text-text-muted">{['Staff', 'Cash taken', 'Cash refunds', 'Expected cash', 'Latest count', 'Difference', 'MoMo / Card', ''].map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {!data.staff.length && <tr><td colSpan="8" className="p-3 text-text-muted">No money was handled at the desk on this date.</td></tr>}
              {data.staff.map((row) => (
                <tr key={row.userId} className="border-b border-border align-top">
                  <td className="p-2 font-semibold">{row.name}</td>
                  <td className="p-2">{cash(row.cashTaken)}</td>
                  <td className="p-2">{cash(row.cashRefunded)}</td>
                  <td className="p-2 font-semibold">{cash(row.expectedCash)}</td>
                  <td className="p-2">{row.latestCount ? <>{cash(row.latestCount.countedAmount)}<span className="block text-xs text-text-muted">{when(row.latestCount.recordedAt)} · by {row.latestCount.recordedBy}</span>{row.latestCount.note && <span className="block text-xs text-text-muted">“{row.latestCount.note}”</span>}</> : <span className="text-text-muted">Not counted</span>}</td>
                  <td className={`p-2 font-semibold ${tone(row.differenceNow)}`}>
                    {row.differenceNow === null ? '—' : signed(row.differenceNow)}
                    {row.changedSinceCount && <span className="mt-1 flex items-start gap-1 text-xs font-normal text-warning-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Payments changed after the count. At count time: expected {cash(row.latestCount.expectedAmount)}, difference {signed(row.latestCount.difference)}.</span>}
                  </td>
                  <td className="p-2 text-text-muted">{cash(row.mobileMoney)} / {cash(row.card)}</td>
                  <td className="p-2"><button type="button" onClick={() => { setCounting(row); setAmount(''); setNote(''); }} className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-secondary-50">Record count</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {counting && (
          <form onSubmit={(event) => { event.preventDefault(); if (valid && !save.isPending) save.mutate(); }} className="flex flex-wrap items-end gap-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3">
            <p className="w-full text-sm font-semibold">Record cash counted for {counting.name} · expected {cash(counting.expectedCash)}</p>
            <label className="text-sm">Counted (GHS)<input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="mt-1 block min-h-11 w-40 rounded-lg border border-border bg-background px-3" /></label>
            <label className="min-w-0 flex-1 text-sm">Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
            <button disabled={!valid || save.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending && <Loader2 size={16} className="animate-spin" />} Save count</button>
            <button type="button" onClick={() => setCounting(null)} className="min-h-11 rounded-lg border border-border px-4 text-sm">Cancel</button>
          </form>
        )}

        <details>
          <summary className="cursor-pointer font-bold">Count history ({data.history.length})</summary>
          {data.history.length === 0 ? <p className="mt-2 text-sm text-text-muted">No counts saved for this date.</p> : (
            <ul className="mt-2 space-y-2 text-sm">
              {data.history.map((c) => (
                <li key={c.cashCountId} className="rounded-lg border border-border p-2">
                  <strong>{c.staffName}</strong> · counted {cash(c.countedAmount)} · expected then {cash(c.expectedAmount)} · <span className={tone(c.difference)}>{signed(c.difference)}</span>
                  <span className="block text-xs text-text-muted">{when(c.recordedAt)} · recorded by {c.recordedBy}{c.note ? ` · “${c.note}”` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </>}
    </section>
  );
}

function Figure({ label, value, hint, valueClass = '', small = false }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`mt-1 font-bold ${small ? 'text-base' : 'text-xl'} ${valueClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
