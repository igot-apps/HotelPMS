import ResponsiveTable from './ui/ResponsiveTable';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import CashReconciliation from './reports/CashReconciliation';

const cash = value => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const actionName = action => action.replace(/^Correction:/, '').replace(/-/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

export default function DailyOverview({ initialDate = '' }) {
  const [date, setDate] = useState(initialDate);
  const [staff, setStaff] = useState('');
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ['dailyOverview', date],
    queryFn: async () => (await api.get('/reports/daily', { params: date ? { date } : {} })).data.data,
    refetchInterval: 60000,
  });
  const field = 'rounded-lg border border-border bg-background px-3 py-2 text-sm text-text';
  const time = value => new Date(value).toLocaleTimeString('en-GH', { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit' });
  return <section id="daily-overview" className="scroll-mt-4 space-y-5 rounded-xl border border-border bg-surface p-5 text-text">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">Daily overview</h2><p className="mt-1 text-sm text-text-muted">Collections and hotel activity · {data?.timeZone || 'Hotel local time'}</p></div>
      <div className="flex flex-wrap gap-2"><input aria-label="Daily overview date" type="date" value={date || data?.date || ''} onChange={e => { setDate(e.target.value); setStaff(''); }} className={field} /><button className={field} onClick={() => { setDate(''); setStaff(''); refetch(); }}>Today</button><button disabled={isFetching} onClick={() => refetch()} className={field}>{isFetching ? 'Refreshing…' : 'Refresh'}</button></div>
    </div>
    {isPending && <p role="status">Loading daily overview…</p>}
    {error && <p role="alert" className="text-danger-700">{error.response?.data?.message || 'Could not load the daily overview. Try Refresh.'}</p>}
    {data && <>
      <p className="text-sm text-text-muted">Recorded collections exclude voided entries and correction replacements. This is a live ledger view, not cash handover or bank reconciliation; past totals can change after corrections.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Payments received', cash(data.collections + data.correctionEntries)], ['Refunds returned', cash(data.refundsReturned)], ['Net collections after refunds', cash(data.netCollections)], ['Outstanding across bookings now', cash(data.activity.outstandingNow)],
      ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-background p-4"><p className="text-sm text-text-muted">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</div>
      <div className="flex flex-wrap gap-3">{data.byMethod.map(row => <span key={row.method} className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700">{row.method}: <strong>{cash(row.total)}</strong></span>)}</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Bookings created', data.activity.bookingsCreated], ['Room check-ins', data.activity.checkIns], ['Room checkouts', data.activity.checkOuts], ['Bookings cancelled', data.activity.cancellations]].map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3"><p className="text-sm text-text-muted">{label}</p><strong>{value}</strong></div>)}</div>
      <p className="text-xs text-text-muted">Activity counts reflect current records; reversed actions remain visible in the activity history below.</p>
      {(data.refunds || []).length > 0 && <div className="space-y-2"><h3 className="font-bold">Money returned today</h3>{data.refunds.map(refund => <RefundLine key={refund.refundId} refund={refund} time={time} cash={cash} />)}</div>}
      {(data.refundsRecordedLate || []).length > 0 && <div className="space-y-2"><h3 className="font-bold">Refunds recorded today for earlier dates</h3><p className="text-xs text-text-muted">Shown for visibility only. They count in the totals of the day the money was returned.</p>{data.refundsRecordedLate.map(refund => <RefundLine key={refund.refundId} refund={refund} time={time} cash={cash} />)}</div>}
      <h3 className="font-bold">Collections by staff ({data.transactions} entries, excluding corrections)</h3>
      <div className="overflow-x-auto"><ResponsiveTable className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">Recorded by</th><th className="p-2">Entries</th><th className="p-2">Methods</th><th className="p-2 text-right">Total</th><th className="p-2">Details</th></tr></thead><tbody>{data.byStaff.map(row => <tr key={row.key} className="border-b border-border"><td className="p-2 font-semibold">{row.name}</td><td className="p-2">{row.count}</td><td className="p-2">{Object.entries(row.methods).map(([method, total]) => `${method}: ${cash(total)}`).join(' · ')}</td><td className="p-2 text-right">{cash(row.total)}</td><td className="p-2"><button onClick={() => setStaff(row.key)} className="text-primary-600 underline">View transactions</button></td></tr>)}</tbody></ResponsiveTable>{!data.byStaff.length && <p className="py-4 text-text-muted">No collection entries for this date.</p>}</div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Payment entries</h3><select aria-label="Filter payments by staff" className={field} value={staff} onChange={e => setStaff(e.target.value)}><option value="">All staff and online payments</option>{[...new Map(data.payments.map(p => [p.staffKey, p.recordedBy]))].map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></div>
      <div className="max-h-96 overflow-auto"><ResponsiveTable className="w-full text-left text-sm"><thead><tr className="border-b border-border">{['Time', 'Guest / booking', 'Recorded by', 'Method', 'Status', 'Amount'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data.payments.filter(p => !staff || p.staffKey === staff).map(p => <tr key={p.paymentId} className="border-b border-border"><td className="p-2 whitespace-nowrap">{time(p.time)}</td><td className="p-2"><Link className="text-primary-600 underline" to={`/reservations/${p.reservationId}`}>{p.guest} · {p.confirmationCode}</Link><div className="text-xs text-text-muted">Payment #{p.paymentId}</div></td><td className="p-2">{p.recordedBy}</td><td className="p-2">{p.method}</td><td className="p-2">{p.status}{p.correction && ' · Correction'}</td><td className="p-2 whitespace-nowrap">{cash(p.amount)}</td></tr>)}</tbody></ResponsiveTable>{!data.payments.length && <p className="py-4 text-text-muted">No payment entries for this date.</p>}</div>
      <details><summary className="cursor-pointer font-bold">Activity and correction history ({data.events.length})</summary><div className="mt-3 max-h-96 space-y-2 overflow-auto">{data.events.map(event => <div key={event.id} className="rounded-lg border border-border p-3 text-sm"><p>{time(event.time)} · <strong className="capitalize">{actionName(event.action)}</strong> · {event.actor}{event.reservationId && <> · <Link className="text-primary-600 underline" to={`/reservations/${event.reservationId}`}>Open booking</Link></>}</p>{event.reason && <p className="mt-1 text-text-muted">{event.reason}</p>}</div>)}{!data.events.length && <p className="text-sm text-text-muted">No recorded activity for this date.</p>}</div></details>
      <p className="text-xs text-text-muted">Updated {time(data.generatedAt)} · refreshes every minute.</p>
    </>}
    {data && <CashReconciliation date={date || data.date} />}
  </section>;
}

// One refund: when it was returned, when and by whom it was recorded, reason, and any policy exception.
function RefundLine({ refund, time, cash }) {
  const late = refund.recordedOn && refund.returnedOn && refund.recordedOn !== refund.returnedOn;
  return <div className="rounded-lg border border-border p-3 text-sm">
    <p>{refund.returnedOn} {time(refund.returnedAt)} · <Link className="text-primary-700 underline" to={`/reservations/${refund.reservationId}#refunds`}>{refund.reservation.confirmationCode}</Link> · {cash(refund.amount)} via {refund.method}
      {refund.policyException && <span className="ml-2 rounded-md border border-warning-200 bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">Policy exception</span>}</p>
    {refund.reason && <p className="mt-1 text-text-muted"><span className="font-semibold text-text">Reason:</span> {refund.reason}</p>}
    <p className="mt-1 text-xs text-text-muted">Recorded by {refund.returnedByName} on {refund.recordedOn} {time(refund.recordedAt)}{late && <span className="ml-1 font-semibold text-warning-700">· recorded later than the return date</span>}</p>
  </div>;
}
