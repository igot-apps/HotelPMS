import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote } from 'lucide-react';
import api from '../../lib/axios';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (value) => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${cash(Math.abs(Number(value || 0)))}`;
const when = (value) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const tone = (value) => (value === null || value === undefined ? 'text-text-muted' : Number(value) === 0 ? 'text-success-700' : Number(value) < 0 ? 'text-danger-700' : 'text-warning-700');

// Manager's end-of-day cash check for one date: expected vs counted per staff member, with the
// other money (desk MoMo/card, verified online, refunds, money owed) shown separately.
export default function CashReconciliation({ date }) {
  const section = useRef(null);
  const { data, isPending, error } = useQuery({
    queryKey: ['cashRecon', date || 'today'],
    queryFn: async () => (await api.get('/dashboard/cash', { params: date ? { date } : {}, skipErrorToast: true })).data.data,
  });
  const t = data?.totals;
  useEffect(() => { if (data && window.location.hash === '#cash') section.current?.scrollIntoView({ block: 'start' }); }, [data]);

  return (
    <section ref={section} id="cash" aria-labelledby="cash-title" className="scroll-mt-4 space-y-4 rounded-xl border border-border bg-surface p-5 text-text">
      <div>
        <h2 id="cash-title" className="flex items-center gap-2 text-xl font-bold"><Banknote size={20} className="text-primary-600" /> Cash reconciliation</h2>
        <p className="mt-1 text-sm text-text-muted">Expected cash = cash payments taken at the desk minus cash refunds returned, per staff member. Saved counts keep the figures as they were when counted. To count cash, use <Link to="/dashboard" className="font-semibold text-primary-700 underline">Count cash on the Manager dashboard</Link>.</p>
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
            <thead><tr className="border-b border-border text-text-muted">{['Staff', 'Cash taken', 'Cash refunds', 'Expected cash', 'Latest count', 'Difference', 'MoMo / Card'].map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {!data.staff.length && <tr><td colSpan="7" className="p-3 text-text-muted">No money was handled at the desk on this date.</td></tr>}
              {data.staff.map((row) => (
                <Fragment key={row.userId}>
                <tr className={`align-top ${row.cashCorrections?.length || row.changesAfterCount?.length ? '' : 'border-b border-border'}`}>
                  <td className="p-2 font-semibold">{row.name}</td>
                  <td className="p-2">{cash(row.cashTaken)}</td>
                  <td className="p-2">{cash(row.cashRefunded)}</td>
                  <td className="p-2 font-semibold">{cash(row.expectedCash)}</td>
                  <td className="p-2">{row.latestCount ? <>{cash(row.latestCount.countedAmount)}<span className="block text-xs text-text-muted">{when(row.latestCount.recordedAt)} · by {row.latestCount.recordedBy}</span>{row.latestCount.note && <span className="block text-xs text-text-muted">“{row.latestCount.note}”</span>}</> : <span className="text-text-muted">Not counted</span>}</td>
                  <td className={`p-2 font-semibold ${tone(row.differenceNow)}`}>
                    {row.differenceNow === null ? '—' : signed(row.differenceNow)}
                    {row.changedSinceCount && <span className="mt-1 flex items-start gap-1 text-xs font-normal text-warning-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Payments or refunds changed after the count. At count time: expected {cash(row.latestCount.expectedAmount)}, difference {signed(row.latestCount.difference)}.</span>}
                  </td>
                  <td className="p-2 text-text-muted">{cash(row.mobileMoney)} / {cash(row.card)}</td>
                </tr>
                {(row.cashCorrections?.length > 0 || row.changesAfterCount?.length > 0) && (
                  <tr className="border-b border-border"><td colSpan="7" className="px-2 pb-3">
                    {row.cashCorrections?.length > 0 && <div className="rounded-lg border border-border bg-background p-2 text-xs">
                      <p className="mb-1 font-semibold text-text">Cash payments corrected down ({row.cashCorrections.length}) · {signed(row.cashCorrections.reduce((sum, c) => sum + c.difference, 0))}</p>
                      <ul className="space-y-1 text-text-muted">{row.cashCorrections.map((c) => (
                        <li key={c.paymentId}><Link to={`/reservations/${c.reservationId}#payments`} className="font-semibold text-primary-700 underline">{c.confirmationCode}</Link> · {cash(c.original)} → {cash(c.corrected)} ({signed(c.difference)}) · collected by {c.collectedBy} · corrected by {c.correctedBy || 'not recorded'}{c.correctedAt ? ` on ${when(c.correctedAt)}` : ''}{c.reason ? ` · reason: ${c.reason}` : ''}</li>
                      ))}</ul>
                    </div>}
                    {row.changesAfterCount?.length > 0 && <div className="mt-2 rounded-lg border border-warning-200 bg-warning-50/50 p-2 text-xs">
                      <p className="mb-1 font-semibold text-warning-700">Recorded or corrected after the latest count ({when(row.latestCount.recordedAt)}) — the saved count is unchanged</p>
                      <ul className="space-y-1 text-text-muted">{row.changesAfterCount.map((c, i) => (
                        <li key={i}>{when(c.at)} · <Link to={`/reservations/${c.reservationId}`} className="font-semibold text-primary-700 underline">{c.confirmationCode}</Link> · {c.detail} · {signed(c.effect)} on expected cash · by {c.by || 'not recorded'}</li>
                      ))}</ul>
                    </div>}
                  </td></tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

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
