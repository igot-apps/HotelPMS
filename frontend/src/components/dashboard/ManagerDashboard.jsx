import { SkeletonLines } from '../ui/Skeleton';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, X, BedDouble, CalendarRange, Coins, Loader2, Receipt, Undo2, Users, Wallet } from 'lucide-react';
import { Drawer } from './TodayAtAGlance';
import { onlineCollected, staffRowsForPeriod } from '../../lib/staffRefunds';
import { MAX_PERIOD_DAYS, PRESETS, daysBetween, defaultToday, periodLabel, presetRange, previousPeriod } from '../../lib/period';
import api from '../../lib/axios';
import { bookingLink } from '../../lib/bookingLink';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (value) => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${cash(Math.abs(Number(value || 0)))}`;
const diffTone = (value) => (Number(value) === 0 ? 'text-success-700' : Number(value) < 0 ? 'text-danger-700' : 'text-warning-700');
const get = (url, params) => async () => (await api.get(url, { params, skipErrorToast: true })).data.data;

// The manager's view: pick a period, see how the hotel did, who handled the money, and the trend.
// "Right now" figures (money owed, rooms tonight) are current and do not follow the period.
export default function ManagerDashboard() {
  const glance = useQuery({ queryKey: ['dashboardGlance'], queryFn: get('/dashboard/glance'), refetchInterval: 60000 });
  const today = defaultToday(glance.data?.timeZone || 'Africa/Accra'); // server time once the first response arrives
  const [params, setParams] = useSearchParams();
  const preset = PRESETS.some(([key]) => key === params.get('period')) ? params.get('period') : 'today';
  const range = preset === 'custom' && params.get('from') && params.get('to') ? { from: params.get('from'), to: params.get('to') } : presetRange(preset, today);
  const { from, to } = range;
  const single = from === to;
  const live = to >= today; // periods that include today refresh every minute
  const refresh = live ? 60000 : false;
  const choose = (next, custom) => {
    const updated = new URLSearchParams(params);
    updated.set('period', next);
    if (next === 'custom') { updated.set('from', custom?.from || from); updated.set('to', custom?.to || to); } else { updated.delete('from'); updated.delete('to'); }
    setParams(updated, { replace: true });
  };

  const prev = previousPeriod(from, to);
  const daily = useQuery({ queryKey: ['dailyOverview', from, to], queryFn: get('/reports/daily', { date: from, to }), refetchInterval: refresh });
  const prevDaily = useQuery({ queryKey: ['dailyOverview', prev.from, prev.to], queryFn: get('/reports/daily', { date: prev.from, to: prev.to }) });
  const report = useQuery({ queryKey: ['dashboardReport', from, to], queryFn: get('/reports', { startDate: from, endDate: to }), refetchInterval: refresh });
  const cashData = useQuery({ queryKey: ['cashRecon', from, to], queryFn: get('/dashboard/cash', single ? { date: from } : { from, to }), refetchInterval: refresh });
  const owedAfter = useQuery({ queryKey: ['owedAfterCheckout'], queryFn: get('/dashboard/owed-after-checkout'), refetchInterval: 60000 });

  const [refundsFor, setRefundsFor] = useState(null);
  const [countingCash, setCountingCash] = useState(false);
  const [cashHistory, setCashHistory] = useState(false);
  const [owedOpen, setOwedOpen] = useState(false);
  const label = periodLabel(from, to, today);
  const summary = report.data?.summary || {};
  const net = daily.data?.netCollections;
  const prevNet = prevDaily.data?.netCollections;
  const growth = prevNet > 0 ? ((net - prevNet) / prevNet) * 100 : null;
  const online = onlineCollected(daily.data);
  const staffRows = staffRowsForPeriod(daily.data);
  const cashRows = cashData.data?.staff || [];
  const cashFor = (userId) => cashRows.find((row) => row.userId === userId);
  const cashLink = `/reports?from=${from}&to=${to}#cash`;
  // Cash for the period: one day uses that day's counts; a range adds up counted days only.
  const cashSummary = !cashData.data ? null : single
    ? { expected: cashData.data.totals.expectedCash, expectedForCounted: cashData.data.totals.expectedForCounted, counted: cashData.data.totals.countedCash, difference: cashData.data.totals.difference, notCounted: cashData.data.totals.notCounted }
    : { expected: cashData.data.totals.expectedCash, expectedForCounted: cashData.data.totals.expectedOnCountedDays, counted: cashData.data.totals.countedPersonDays ? cashData.data.totals.countedCash : null, difference: cashData.data.totals.countedPersonDays ? cashData.data.totals.differenceOnCountedDays : null, countedDays: cashData.data.totals.countedPersonDays, uncountedDays: cashData.data.totals.uncountedPersonDays };

  const owedInHouse = glance.data?.money?.inHouseOutstanding || 0;
  const owedAfterTotal = owedAfter.data?.total || 0;
  const owedAfterCount = owedAfter.data?.bookings?.length || 0;
  const refundsWaiting = glance.data?.money?.refundsPending || 0;
  const toClean = glance.data?.rooms?.needsCleaning?.length || 0;
  const todo = [
    refundsWaiting > 0 && { to: '/refunds', icon: Undo2, text: `${refundsWaiting} refund${refundsWaiting === 1 ? '' : 's'} to return` },
    toClean > 0 && { to: '/rooms', icon: BedDouble, text: `${toClean} room${toClean === 1 ? '' : 's'} need cleaning` },
  ].filter(Boolean);
  const totals = staffRows.reduce((t, r) => ({ count: t.count + r.count, total: t.total + r.total, refunds: t.refunds + r.refundCount, refundTotal: t.refundTotal + r.refundTotal, late: t.late + r.recordedLate.length, exceptions: t.exceptions + r.exceptions }), { count: 0, total: 0, refunds: 0, refundTotal: 0, late: 0, exceptions: 0 });

  return (
    <div className="space-y-5">
      <PeriodPicker preset={preset} from={from} to={to} today={today} onChoose={choose} />

      {/* Business overview — the selected period */}
      <section aria-labelledby="mgr-overview" className="space-y-3">
        <h2 id="mgr-overview" className="text-lg font-bold text-text">Business overview · {label}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat icon={Coins} label="Money collected (all methods)" tone="success" loading={daily.isLoading}
            value={daily.isError ? '—' : cash(net)}
            hint={daily.data ? <>
              <span className="block">{cash(daily.data.collections + daily.data.correctionEntries - online)} at the desk · {cash(online)} online · after {cash(daily.data.refundsReturned)} refunds</span>
              {growth !== null && <span className={`inline-flex items-center gap-1 ${growth >= 0 ? 'text-success-700' : 'text-danger-700'}`}>{growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(growth).toFixed(0)}% vs previous {daysBetween(from, to) === 1 ? 'day' : `${daysBetween(from, to)} days`}</span>}
            </> : ''} />
          <CashDrawerStat loading={cashData.isLoading} summary={cashSummary} onClick={() => setCountingCash(true)} />
          <Stat icon={BedDouble} label="Rooms sold" loading={report.isLoading} tone="primary"
            value={report.isError ? '—' : `${summary.occupancyRate || 0}% full`}
            hint={report.data ? `${summary.actualOccupiedNights || 0} of ${summary.totalAvailableNights || 0} room-nights · avg ${cash(summary.adr)} per night sold · ${cash(summary.revpar)} per room` : ''} />
        </div>

        {/* Current state — not affected by the period */}
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Right now</p>
          <div className="flex flex-wrap gap-2">
            <NowChip to="/reservations?status=InHouse" icon={Wallet} tone={owedInHouse > 0 ? 'warning' : 'neutral'} text={`Owed by guests still here: ${cash(owedInHouse)}`} />
            <NowChip onClick={() => setOwedOpen(true)} icon={Receipt} tone={owedAfterTotal > 0 ? 'danger' : 'neutral'} text={`Owed by guests who left: ${cash(owedAfterTotal)} (${owedAfterCount})`} />
            <NowChip to="/rooms" icon={BedDouble} tone="neutral" text={glance.data ? `Rooms taken tonight: ${glance.data.rooms.occupiedTonight} of ${glance.data.rooms.total}` : 'Rooms taken tonight: —'} />
            {todo.map(({ to: link, icon, text }) => <NowChip key={text} to={link} icon={icon} tone="warning" text={text} />)}
          </div>
        </div>
      </section>

      {/* Staff accountability — the selected period */}
      <section aria-labelledby="mgr-staff" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 id="mgr-staff" className="mb-1 flex items-center gap-2 text-sm font-bold text-text"><Users size={17} className="text-primary-600" /> Staff accountability · {label}</h2>
        <p className="mb-3 text-xs text-text-muted">Refunds count on the day the money was returned. Refunds recorded in this period for earlier days are shown separately and not added again.</p>
        {daily.isLoading ? <Loading /> : !staffRows.length ? <p className="text-sm text-text-muted">No payments or refunds recorded by staff in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead><tr className="border-b border-border text-xs text-text-muted">{['Staff', 'Collected', 'Refunds', 'Policy exceptions', single ? 'Cash difference' : 'Cash (counted days)'].map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {staffRows.map((row) => {
                  const c = row.userId ? cashFor(row.userId) : null;
                  const counted = single ? c?.latestCount : c?.countedDays;
                  const difference = single ? c?.differenceNow : c?.differenceOnCountedDays;
                  return (
                    <tr key={row.key} className="border-b border-border align-top">
                      <td className="p-2 font-semibold text-text">{row.name}</td>
                      <td className="p-2">{cash(row.total)}<span className="block text-xs text-text-muted">{row.count} payment{row.count === 1 ? '' : 's'}</span></td>
                      <td className="p-2">
                        {row.refundCount || row.recordedLate.length ? (
                          <button type="button" onClick={() => setRefundsFor(row)} className="min-h-9 rounded-lg border border-border px-2.5 text-left text-xs font-semibold text-primary-700 hover:bg-secondary-50">
                            {row.refundCount} refund{row.refundCount === 1 ? '' : 's'} · {cash(row.refundTotal)}
                            {row.recordedLate.length > 0 && <span className="block font-normal text-warning-700">+{row.recordedLate.length} recorded late</span>}
                          </button>
                        ) : <span className="text-text-muted">—</span>}
                      </td>
                      <td className={`p-2 ${row.exceptions ? 'font-semibold text-warning-700' : 'text-text-muted'}`}>{row.exceptions || '—'}</td>
                      <td className="p-2">
                        {!c ? <span className="text-text-muted">No cash</span> : counted ? <span className={`font-semibold ${diffTone(difference)}`}>{Number(difference) === 0 ? 'Matches' : signed(difference)}</span> : <span className="text-text-muted">Not counted</span>}
                        {!single && c && <span className="block text-xs text-text-muted">{c.countedDays} of {c.days.length} days counted</span>}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-semibold text-text">
                  <td className="p-2">Total</td>
                  <td className="p-2">{cash(totals.total)}</td>
                  <td className="p-2">{totals.refunds} · {cash(totals.refundTotal)}{totals.late > 0 && <span className="block text-xs font-normal text-warning-700">+{totals.late} recorded late</span>}</td>
                  <td className="p-2">{totals.exceptions || '—'}</td>
                  <td className="p-2"><button type="button" onClick={() => setCountingCash(true)} className="text-xs font-semibold text-primary-700 underline">Count cash</button>{' · '}<button type="button" onClick={() => setCashHistory(true)} className="text-xs font-semibold text-primary-700 underline">Count history</button>{!single && <>{' · '}<Link to={cashLink} className="text-xs text-primary-700 underline">Each day</Link></>}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Business trend — only for periods longer than a day */}
      {!single && (
        <section aria-labelledby="mgr-trend" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 id="mgr-trend" className="mb-3 text-sm font-bold text-text">Money collected each day (after refunds) · {label}</h2>
          {report.isLoading ? <Loading /> : <DailyBars days={report.data?.timeSeries || []} />}
        </section>
      )}

      {countingCash && <CountCashDialog from={from} to={to} today={today} onClose={() => setCountingCash(false)} />}
      {owedOpen && <OwedAfterCheckoutDrawer query={owedAfter} onClose={() => setOwedOpen(false)} />}
      {cashHistory && <CountHistoryDialog from={from} to={to} today={today} onClose={() => setCashHistory(false)} />}
      {refundsFor && (
        <Drawer title={`Refunds · ${refundsFor.name} · ${label}`} onClose={() => setRefundsFor(null)}>
          <RefundGroup title="Returned in this period" refunds={refundsFor.returned} empty="No refunds returned in this period." />
          {refundsFor.recordedLate.length > 0 && <RefundGroup title="Recorded in this period for earlier days (not added to this period's totals)" refunds={refundsFor.recordedLate} />}
        </Drawer>
      )}
    </div>
  );
}

// Count cash from the dashboard: pick the day (inside the selected period), see each receptionist's
// expected cash, enter what was counted. Counts are append-only: a recount adds a new entry and the
// earlier ones stay in the history. Uses the existing cash reconciliation API.
function CountCashDialog({ from, to, today, onClose }) {
  const queryClient = useQueryClient();
  const lastDay = to > today ? today : to;
  const [day, setDay] = useState(lastDay < from ? from : lastDay);
  const [staffId, setStaffId] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  // Same query key as the dashboard's one-day cash figures, so both stay in step.
  const dayCash = useQuery({ queryKey: ['cashRecon', day, day], queryFn: get('/dashboard/cash', { date: day }) });
  const rows = dayCash.data?.staff || [];
  const row = rows.find((r) => r.userId === staffId);
  const history = (dayCash.data?.history || []).filter((c) => c.staffUserId === staffId);
  const valid = Boolean(row) && /^\d+(\.\d{1,2})?$/.test(amount);
  const difference = valid ? Number(amount) - Number(row.expectedCash) : null;
  const pick = (id) => { setStaffId(id === staffId ? null : id); setAmount(''); setNote(''); };
  const save = useMutation({
    mutationFn: async () => (await api.post('/dashboard/cash-counts', { date: day, staffUserId: row.userId, countedAmount: Number(amount), note }, { skipErrorToast: true })).data.data,
    onSuccess: async (result) => {
      toast.success(Number(result.difference) === 0 ? `Cash count saved for ${row.name}. It matches.` : `Cash count saved for ${row.name}. ${Number(result.difference) < 0 ? 'Short' : 'Over'} by ${cash(Math.abs(result.difference))}.`);
      setAmount(''); setNote(''); setStaffId(null);
      await queryClient.invalidateQueries({ queryKey: ['cashRecon'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save the cash count.'),
  });
  const status = (r) => {
    if (!r.latestCount) return <span className="text-text-muted">Not counted</span>;
    const d = Number(r.differenceNow);
    return <span className={`font-semibold ${diffTone(d)}`}>{d === 0 ? 'Matches' : `${d < 0 ? 'Short' : 'Over'} ${cash(Math.abs(d))}`}</span>;
  };

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="count-cash-title">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 id="count-cash-title" className="flex items-center gap-2 text-lg font-bold text-text"><Banknote size={20} className="text-primary-600" /> Count cash</h2>
            <p className="text-sm text-text-muted">Choose a receptionist, count their cash and save.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <label className="block text-sm font-semibold text-text">Day
            {from === lastDay
              ? <span className="mt-1 block font-normal text-text-muted">{periodLabel(day, day, today)} · {day}</span>
              : <input type="date" value={day} min={from} max={lastDay} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setStaffId(null); setAmount(''); } }}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-text" />}
          </label>
          {dayCash.isPending && <p role="status" className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</p>}
          {dayCash.error && <p role="alert" className="text-sm text-danger-700">{dayCash.error.response?.data?.message || 'Could not load cash for this day.'}</p>}
          {dayCash.data && !rows.length && <p className="rounded-lg bg-secondary-50 p-3 text-sm text-text-muted">No cash was handled at the desk on this day.</p>}
          {rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.userId} className={`rounded-lg border ${r.userId === staffId ? 'border-primary-300 bg-primary-50/40' : 'border-border'}`}>
                  <button type="button" onClick={() => pick(r.userId)} aria-expanded={r.userId === staffId}
                    className="flex min-h-12 w-full items-center justify-between gap-3 p-3 text-left text-sm">
                    <span className="min-w-0"><span className="block font-semibold text-text">{r.name}</span><span className="block text-xs text-text-muted">Expected {cash(r.expectedCash)}</span></span>
                    <span className="shrink-0 text-right text-xs">{status(r)}<span className="block text-primary-700">{r.userId === staffId ? 'Close' : r.latestCount ? 'Recount' : 'Count'}</span></span>
                  </button>
                  {r.userId === staffId && (
                    <form onSubmit={(event) => { event.preventDefault(); if (valid && !save.isPending) save.mutate(); }} className="space-y-3 border-t border-border p-3">
                      <p className="text-xs text-text-muted">{cash(r.cashTaken)} cash taken − {cash(r.cashRefunded)} cash refunds = <strong className="text-text">{cash(r.expectedCash)} expected</strong></p>
                      {r.changedSinceCount && <p className="flex items-start gap-1 text-xs text-warning-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Payments or refunds changed after the last count.</p>}
                      <label className="block text-sm font-semibold text-text">Actual cash counted (GHS)
                        <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={Number(r.expectedCash).toFixed(2)}
                          className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-text" />
                      </label>
                      {difference !== null && <p className={`text-sm font-semibold ${diffTone(difference)}`}>{difference === 0 ? 'Matches the expected cash.' : `${difference < 0 ? 'Short' : 'Over'} by ${cash(Math.abs(difference))}`}</p>}
                      <label className="block text-sm font-semibold text-text">Note <span className="font-normal text-text-muted">(optional)</span>
                        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text" />
                      </label>
                      <button disabled={!valid || save.isPending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending && <Loader2 size={16} className="animate-spin" />} {r.latestCount ? 'Save recount' : 'Save count'}</button>
                      {history.length > 0 && (
                        <div className="text-xs text-text-muted">
                          <p className="font-semibold text-text">Earlier counts ({history.length}) · kept, not replaced</p>
                          <ul className="mt-1 space-y-1">{history.map((c) => (
                            <li key={c.cashCountId}>{new Date(c.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {cash(c.countedAmount)} counted · <span className={diffTone(c.difference)}>{signed(c.difference)}</span> · by {c.recordedBy}{c.note ? ` · “${c.note}”` : ''}</li>
                          ))}</ul>
                        </div>
                      )}
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <span />
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm text-text">Done</button>
        </div>
      </div>
    </div>
  );
}

// Guests who checked out still owing money: the same list (and total) as the dashboard figure.
// View only; payments and corrections stay on the reservation.
function OwedAfterCheckoutDrawer({ query, onClose }) {
  const rows = query.data?.bookings || [];
  return (
    <Drawer title="Owed by guests who left" onClose={onClose}>
      {query.isLoading && <p role="status" className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</p>}
      {query.isError && <p role="alert" className="text-sm text-danger-700">Could not load this list. Please try again.</p>}
      {query.data && <>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-sm text-text-muted">Total owed</p>
          <p className={`text-2xl font-bold ${rows.length ? 'text-danger-700' : 'text-text'}`}>{cash(query.data.total)}</p>
          <p className="text-xs text-text-muted">{rows.length} {rows.length === 1 ? 'booking' : 'bookings'}</p>
        </div>
        {!rows.length ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">No guest has left owing money.</p> : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.reservationId}>
                <Link to={bookingLink(row)} className="block rounded-lg border border-border p-3 hover:border-primary-300 hover:bg-secondary-50">
                  <span className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{row.guestName}</span><span className="shrink-0 rounded-md bg-danger-50 px-2 py-0.5 text-xs font-bold text-danger-700">{cash(row.balanceDue)}</span></span>
                  <span className="mt-0.5 block text-sm text-text-muted">{row.confirmationCode}{row.roomNumbers?.length ? ` · Room ${row.roomNumbers.join(', ')}` : ''}</span>
                  <span className="mt-0.5 block text-sm text-text-muted">{row.checkedOutAt ? `Left ${new Date(row.checkedOutAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Departure date not recorded'}</span>
                  <span className="mt-1 block text-xs font-semibold text-primary-700">Open reservation →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>}
    </Drawer>
  );
}

// Every saved cash count for one day (all staff, newest first), including recounts. Read-only.
function CountHistoryDialog({ from, to, today, onClose }) {
  const lastDay = to > today ? today : to;
  const [day, setDay] = useState(lastDay < from ? from : lastDay);
  const dayCash = useQuery({ queryKey: ['cashRecon', day, day], queryFn: get('/dashboard/cash', { date: day }) });
  const history = dayCash.data?.history || [];
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="count-history-title">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 id="count-history-title" className="flex items-center gap-2 text-lg font-bold text-text"><Banknote size={20} className="text-primary-600" /> Count history</h2>
            <p className="text-sm text-text-muted">Every cash count saved for the day. Recounts are added; earlier counts are kept.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <label className="block text-sm font-semibold text-text">Day
            {from === lastDay
              ? <span className="mt-1 block font-normal text-text-muted">{periodLabel(day, day, today)} · {day}</span>
              : <input type="date" value={day} min={from} max={lastDay} onChange={(e) => e.target.value && setDay(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-text" />}
          </label>
          {dayCash.isPending && <p role="status" className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</p>}
          {dayCash.error && <p role="alert" className="text-sm text-danger-700">{dayCash.error.response?.data?.message || 'Could not load the count history.'}</p>}
          {dayCash.data && !history.length && <p className="rounded-lg bg-secondary-50 p-3 text-sm text-text-muted">No cash counts saved for this day.</p>}
          {history.length > 0 && (
            <ul className="space-y-2">
              {history.map((c) => (
                <li key={c.cashCountId} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-text">{c.staffName}</span>
                    <span className={`font-semibold ${diffTone(c.difference)}`}>{Number(c.difference) === 0 ? 'Matched' : `${Number(c.difference) < 0 ? 'Short' : 'Over'} ${cash(Math.abs(c.difference))}`}</span>
                  </div>
                  <p className="text-text-muted">Counted {cash(c.countedAmount)} · expected then {cash(c.expectedAmount)}</p>
                  <p className="text-xs text-text-muted">{new Date(c.recordedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · by {c.recordedBy}{c.note ? ` · “${c.note}”` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end border-t border-border p-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm text-text">Close</button>
        </div>
      </div>
    </div>
  );
}

function PeriodPicker({ preset, from, to, today, onChoose }) {
  const [draft, setDraft] = useState({ from, to });
  const invalid = !draft.from || !draft.to || draft.to < draft.from || draft.to > today || daysBetween(draft.from, draft.to) > MAX_PERIOD_DAYS;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange size={18} className="text-primary-600" />
        {PRESETS.map(([key, text]) => (
          <button key={key} type="button" onClick={() => (key === 'custom' ? onChoose('custom', { from, to }) : onChoose(key))} aria-pressed={preset === key}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${preset === key ? 'bg-primary-600 text-white' : 'border border-border text-text hover:bg-secondary-50'}`}>{text}</button>
        ))}
      </div>
      {preset === 'custom' && (
        <form onSubmit={(event) => { event.preventDefault(); if (!invalid) onChoose('custom', draft); }} className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-text-muted">From<input type="date" value={draft.from} max={today} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="mt-1 block min-h-10 rounded-lg border border-border bg-background px-2 text-text" /></label>
          <label className="text-sm text-text-muted">To<input type="date" value={draft.to} max={today} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="mt-1 block min-h-10 rounded-lg border border-border bg-background px-2 text-text" /></label>
          <button disabled={invalid} className="min-h-10 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
          {invalid && <span className="text-xs text-text-muted">Choose up to {MAX_PERIOD_DAYS} days, ending today or earlier.</span>}
        </form>
      )}
    </div>
  );
}

function RefundGroup({ title, refunds, empty }) {
  const time = (value) => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">{title} ({refunds.length})</h3>
      {!refunds.length ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">{empty}</p> : (
        <ul className="space-y-2">{refunds.map((r) => (
          <li key={r.refundId} className="rounded-lg border border-border p-3 text-sm">
            <p className="flex flex-wrap items-start justify-between gap-2"><span className="font-semibold text-text">{r.guestName}</span><strong className="text-text">{cash(r.amount)}</strong></p>
            <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{r.reservation.confirmationCode}</p>
            <p className="mt-1 text-text-muted"><span className="font-semibold text-text">Reason:</span> {r.reason || 'Not recorded'}</p>
            <p className="text-text-muted">Returned via {r.method} on {r.returnedOn} {time(r.returnedAt)}</p>
            {r.recordedLate && <p className="font-semibold text-warning-700">Recorded later: {r.recordedOn} {time(r.recordedAt)}</p>}
            {r.policyException && <p className="mt-1 inline-block rounded-md border border-warning-200 bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700">Policy exception</p>}
            <Link to={`/reservations/${r.reservationId}#refunds`} className="mt-2 flex min-h-10 items-center justify-center rounded-lg border border-border text-sm font-semibold text-primary-700 hover:bg-secondary-50">Open reservation</Link>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

const TONES = { primary: 'text-primary-600 bg-primary-50', success: 'text-success-600 bg-success-50', warning: 'text-warning-600 bg-warning-50', danger: 'text-danger-600 bg-danger-50', neutral: 'text-secondary-600 bg-secondary-50' };

// Cash at the desk is not the same as "money collected": it is only cash, and it is only
// reconciled for staff who have saved a count. The card keeps those two amounts apart.
function CashDrawerStat({ summary, loading, onClick }) {
  const counted = summary?.counted ?? null;
  const difference = summary?.difference ?? null;
  const hasCount = counted !== null && difference !== null;
  const outstanding = summary?.notCounted?.length
    ? `${summary.notCounted.join(', ')} not counted yet`
    : summary?.uncountedDays ? `${summary.uncountedDays} day${summary.uncountedDays === 1 ? '' : 's'} not counted` : '';
  const status = !hasCount
    ? { text: 'Nothing counted yet', box: 'border-border bg-background', tone: 'text-text-muted' }
    : Number(difference) === 0
      ? { text: outstanding ? 'Matches for counted staff so far' : 'Matches expected cash', box: 'border-success-100 bg-success-50', tone: 'text-success-700' }
      : Number(difference) < 0
        ? { text: `Short ${cash(Math.abs(difference))}`, box: 'border-danger-100 bg-danger-50', tone: 'text-danger-700' }
        : { text: `Over ${cash(Math.abs(difference))}`, box: 'border-warning-100 bg-warning-50', tone: 'text-warning-700' };
  return (
    <button type="button" onClick={onClick} aria-label="Count cash"
      className="block w-full min-w-0 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-muted">Cash drawer</p>
          <p className="text-xs text-text-muted">Cash at the desk · not card or online</p>
        </div>
        <span className="rounded-lg bg-warning-50 p-2 text-warning-600"><Banknote size={18} /></span>
      </div>
      {loading ? <Loader2 size={20} className="mt-3 animate-spin text-text-muted" /> : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-background p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Expected</p>
              <p className="mt-0.5 break-words text-xl font-bold text-text">{summary ? cash(summary.expected) : '—'}</p>
              <p className="text-[11px] leading-snug text-text-muted">Cash taken − refunds</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Counted</p>
              <p className="mt-0.5 break-words text-xl font-bold text-text">{hasCount ? cash(counted) : '—'}</p>
              <p className="text-[11px] leading-snug text-text-muted">{hasCount ? `Against ${cash(summary.expectedForCounted)} expected` : 'No cash count saved'}</p>
            </div>
          </div>
          <p className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${status.box} ${status.tone}`}>{status.text}</p>
          {outstanding && <p className="mt-1.5 text-xs text-text-muted">{outstanding}</p>}
          <p className="mt-2 text-xs font-semibold text-primary-700">Count cash →</p>
        </>
      )}
    </button>
  );
}

function Stat({ to, onClick, icon: Icon, label, value, hint, loading, tone = 'neutral' }) {
  const Box = onClick ? 'button' : to ? Link : 'div';
  return (
    <Box {...(onClick ? { type: 'button', onClick } : to ? { to } : {})} className={`block w-full min-w-0 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition ${to || onClick ? 'hover:border-primary-300 hover:shadow-md' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-text-muted">{label}</p>
        <span className={`rounded-lg p-2 ${TONES[tone]}`}><Icon size={18} /></span>
      </div>
      {loading ? <Loader2 size={20} className="mt-2 animate-spin text-text-muted" /> : <p className="mt-1 break-words text-2xl font-bold text-text">{value}</p>}
      {hint && !loading && <div className="mt-1 space-y-0.5 text-xs text-text-muted">{hint}</div>}
    </Box>
  );
}

function NowChip({ to, onClick, icon: Icon, text, tone }) {
  const tones = { warning: 'border-warning-200 bg-warning-50/60 text-warning-700', danger: 'border-danger-100 bg-danger-50 text-danger-700', neutral: 'border-border bg-surface text-text' };
  const className = `inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:opacity-90 ${tones[tone]}`;
  if (onClick) return <button type="button" onClick={onClick} className={className}><Icon size={15} className="shrink-0" /> {text}</button>;
  return <Link to={to} className={className}><Icon size={15} className="shrink-0" /> {text}</Link>;
}

function DailyBars({ days }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  if (!days.length || days.every((d) => !d.total)) return <p className="text-sm text-text-muted">No money collected in this period.</p>;
  return (
    <div className="flex h-36 items-end gap-1 overflow-x-auto pb-6">
      {days.map((day) => (
        <div key={day.date} className="group relative flex h-full min-w-[10px] flex-1 flex-col items-center justify-end" tabIndex={0} aria-label={`${day.date}: ${cash(day.total)}`}>
          <div className="w-full rounded-t bg-primary-500 transition group-hover:bg-primary-700 group-focus:bg-primary-700" style={{ height: `${Math.max(day.total > 0 ? 3 : 0, (Math.max(0, day.total) / max) * 100)}%` }} />
          <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-text px-2 py-1 text-xs text-surface group-hover:block group-focus:block">{day.date}: {cash(day.total)}</span>
          {days.length <= 31 && <span className="absolute -bottom-5 text-[10px] text-text-muted">{Number(String(day.date).slice(8, 10))}</span>}
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return <SkeletonLines lines={4} />;
}
