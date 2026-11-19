import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, BedDouble, Coins, Loader2, Receipt, Undo2, Users, Wallet } from 'lucide-react';
import api from '../../lib/axios';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// This month so far (1st → today), same period the reports page compares with the previous one.
function monthRange() {
  const now = new Date();
  return { startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: ymd(now), label: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
}

// The manager's view of the business: money, rooms and what needs a decision, in plain words.
export default function ManagerDashboard() {
  const month = monthRange();
  const report = useQuery({
    queryKey: ['dashboardReport', month.startDate, month.endDate, 'manager'],
    queryFn: async () => (await api.get('/reports', { params: { startDate: month.startDate, endDate: month.endDate }, skipErrorToast: true })).data.data,
    refetchInterval: 5 * 60000,
  });
  const today = useQuery({
    queryKey: ['dailyOverview', ''],
    queryFn: async () => (await api.get('/reports/daily', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const glance = useQuery({
    queryKey: ['dashboardGlance'],
    queryFn: async () => (await api.get('/dashboard/glance', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const cashToday = useQuery({
    queryKey: ['cashRecon', 'today'],
    queryFn: async () => (await api.get('/dashboard/cash', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const cashTotals = cashToday.data?.totals;
  const owedAfter = useQuery({
    queryKey: ['owedAfterCheckout'],
    queryFn: async () => (await api.get('/dashboard/owed-after-checkout', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });

  const summary = report.data?.summary || {};
  const trend = report.data?.timeSeries || [];
  const byMethod = report.data?.categories?.byMethod || [];
  const byRoomType = report.data?.categories?.byRoomType || [];
  const growth = Number(summary.revenueGrowth || 0);
  const owedInHouse = glance.data?.money?.inHouseOutstanding || 0;
  const owedAfterTotal = owedAfter.data?.total || 0;
  const refunds = glance.data?.money?.refundsPending || 0;
  const owedAfterCount = owedAfter.data?.bookings?.length || 0;
  const todo = [
    refunds > 0 && { to: '/refunds', icon: Undo2, text: `${refunds} refund${refunds === 1 ? '' : 's'} to return to guests` },
    owedAfterCount > 0 && { to: '/reservations?status=Completed', icon: Receipt, text: `${owedAfterCount} guest${owedAfterCount === 1 ? '' : 's'} left owing ${cash(owedAfterTotal)}` },
    (glance.data?.rooms?.needsCleaning?.length || 0) > 0 && { to: '/rooms', icon: BedDouble, text: `${glance.data.rooms.needsCleaning.length} room${glance.data.rooms.needsCleaning.length === 1 ? '' : 's'} need cleaning` },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Needs your decision */}
      <section aria-labelledby="mgr-todo" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 id="mgr-todo" className="mb-3 flex items-center gap-2 text-sm font-bold text-text"><AlertTriangle size={17} className="text-warning-600" /> Needs your attention</h2>
        {glance.isLoading ? <Loading /> : todo.length === 0
          ? <p className="text-sm text-success-700">Nothing is waiting for you right now.</p>
          : <ul className="grid gap-2 sm:grid-cols-2">{todo.map(({ to, icon: Icon, text }) => (
            <li key={text}><Link to={to} className="flex min-h-11 items-center gap-3 rounded-lg border border-warning-200 bg-warning-50/50 px-3 py-2 text-sm font-semibold text-warning-700 hover:bg-warning-50"><Icon size={17} className="shrink-0" /> {text}</Link></li>
          ))}</ul>}
      </section>

      {/* Money */}
      <section aria-labelledby="mgr-money" className="space-y-3">
        <h2 id="mgr-money" className="text-lg font-bold text-text">Money</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat to="/reports#cash" icon={Coins} label="Cash today: expected vs counted" loading={cashToday.isLoading} tone={cashTotals?.difference ? 'danger' : 'success'}
            value={cashToday.isError || !cashTotals ? '—' : cash(cashTotals.expectedCash)}
            hint={!cashTotals ? '' : cashTotals.countedCash === null ? 'Not counted yet' : `Counted ${cash(cashTotals.countedCash)} · ${Number(cashTotals.difference) === 0 ? 'matches' : `difference ${Number(cashTotals.difference) > 0 ? '+' : '−'}${cash(Math.abs(cashTotals.difference))}`}`} />
          <Stat to="/reports" icon={Coins} label="Collected today" value={today.isError ? '—' : cash(today.data?.netCollections)} hint={today.data ? `${today.data.transactions} payment${today.data.transactions === 1 ? '' : 's'} · after refunds` : ''} loading={today.isLoading} tone="success" />
          <Stat to="/reports" icon={Coins} label={`Collected in ${month.label}`} value={report.isError ? '—' : cash(summary.currentRevenue)} loading={report.isLoading} tone="primary"
            hint={report.data ? <span className={`inline-flex items-center gap-1 ${growth >= 0 ? 'text-success-700' : 'text-danger-700'}`}>{growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(growth).toFixed(0)}% vs the same days last period</span> : ''} />
          <Stat to="/reservations?status=InHouse" icon={Wallet} label="Owed by guests still here" value={glance.isError ? '—' : cash(owedInHouse)} hint={`${glance.data?.money?.unpaidInHouse?.length || 0} booking${glance.data?.money?.unpaidInHouse?.length === 1 ? '' : 's'}`} loading={glance.isLoading} tone={owedInHouse > 0 ? 'warning' : 'neutral'} />
          <Stat to="/reservations?status=Completed" icon={Receipt} label="Owed by guests who left" value={owedAfter.isError ? '—' : cash(owedAfterTotal)} hint={`${owedAfterCount} guest${owedAfterCount === 1 ? '' : 's'} to follow up`} loading={owedAfter.isLoading} tone={owedAfterTotal > 0 ? 'danger' : 'neutral'} />
        </div>
      </section>

      {/* Rooms */}
      <section aria-labelledby="mgr-rooms" className="space-y-3">
        <h2 id="mgr-rooms" className="text-lg font-bold text-text">Rooms</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat to="/rooms" icon={BedDouble} label="Rooms taken tonight" value={glance.data ? `${glance.data.rooms.occupiedTonight} of ${glance.data.rooms.total}` : '—'} hint={glance.data ? `${glance.data.rooms.occupancyPercent}% full tonight` : ''} loading={glance.isLoading} tone="primary" />
          <Stat to="/reports" icon={BarChart3} label={`How full in ${month.label}`} value={`${summary.occupancyRate || 0}%`} hint={`${summary.actualOccupiedNights || 0} of ${summary.totalAvailableNights || 0} room-nights sold`} loading={report.isLoading} tone="primary" />
          <Stat to="/reports" icon={Coins} label="Average price per night sold" value={cash(summary.adr)} hint="Room money ÷ nights sold" loading={report.isLoading} tone="neutral" />
          <Stat to="/reports" icon={Coins} label="Earned per room per night" value={cash(summary.revpar)} hint="Room money ÷ all room-nights, sold or empty" loading={report.isLoading} tone="neutral" />
        </div>
      </section>

      {/* Trend + breakdowns */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-1 text-sm font-bold text-text">Money collected each day · {month.label}</h2>
          <p className="mb-4 text-xs text-text-muted">Tap or hover a bar to see the amount.</p>
          {report.isLoading ? <Loading /> : <DailyBars days={trend} />}
        </section>
        <section className="min-w-0 space-y-5 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <Breakdown title="How guests paid" rows={byMethod.map((m) => ({ label: m.method === 'MobileMoney' ? 'Mobile Money' : m.method, total: m.total }))} loading={report.isLoading} />
          <Breakdown title="Money by room type" rows={byRoomType.map((r) => ({ label: r.typeName, total: r.total }))} loading={report.isLoading} />
        </section>
      </div>

      {/* Who took money today */}
      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-text"><Users size={17} className="text-primary-600" /> Money taken by each staff member today</h2>
        {today.isLoading ? <Loading /> : !(today.data?.byStaff || []).length
          ? <p className="text-sm text-text-muted">No payments recorded yet today.</p>
          : <ul className="divide-y divide-border">{today.data.byStaff.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="font-semibold text-text">{row.name}</span><span className="text-text-muted">{row.count} payment{row.count === 1 ? '' : 's'} · <strong className="text-text">{cash(row.total)}</strong></span></li>
          ))}</ul>}
      </section>

      <p className="text-sm text-text-muted">Need more detail, other dates or every payment line? <Link to="/reports" className="font-semibold text-primary-700 hover:underline">Open full reports</Link></p>
    </div>
  );
}

const TONES = { primary: 'text-primary-600 bg-primary-50', success: 'text-success-600 bg-success-50', warning: 'text-warning-600 bg-warning-50', danger: 'text-danger-600 bg-danger-50', neutral: 'text-secondary-600 bg-secondary-50' };

function Stat({ to, icon: Icon, label, value, hint, loading, tone = 'neutral' }) {
  // Every figure opens the page where it can be checked or acted on.
  return (
    <Link to={to} className="block min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-text-muted">{label}</p>
        <span className={`rounded-lg p-2 ${TONES[tone]}`}><Icon size={18} /></span>
      </div>
      {loading ? <Loader2 size={20} className="mt-2 animate-spin text-text-muted" /> : <p className="mt-1 break-words text-2xl font-bold text-text">{value}</p>}
      {hint && !loading && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </Link>
  );
}

function DailyBars({ days }) {
  const max = Math.max(...days.map((d) => d.total), 1);
  if (!days.length || days.every((d) => !d.total)) return <p className="text-sm text-text-muted">No money collected yet this month.</p>;
  return (
    <div className="flex h-44 items-end gap-1 overflow-x-auto pb-6">
      {days.map((day) => (
        <div key={day.date} className="group relative flex h-full min-w-[10px] flex-1 flex-col items-center justify-end" tabIndex={0} aria-label={`${day.date}: ${cash(day.total)}`}>
          <div className="w-full rounded-t bg-primary-500 transition group-hover:bg-primary-700 group-focus:bg-primary-700" style={{ height: `${Math.max(day.total ? 3 : 0, (day.total / max) * 100)}%` }} />
          <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded bg-text px-2 py-1 text-xs text-surface group-hover:block group-focus:block">{cash(day.total)}</span>
          <span className="absolute -bottom-5 text-[10px] text-text-muted">{Number(String(day.date).slice(8, 10))}</span>
        </div>
      ))}
    </div>
  );
}

function Breakdown({ title, rows, loading }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-text">{title}</h3>
      {loading ? <Loading /> : !rows.length ? <p className="text-sm text-text-muted">Nothing yet this month.</p> : (
        <ul className="space-y-2">{rows.map((row) => (
          <li key={row.label}>
            <div className="flex justify-between gap-2 text-sm"><span className="text-text">{row.label}</span><span className="font-semibold text-text">{cash(row.total)}</span></div>
            <div className="mt-1 h-2 rounded-full bg-secondary-100"><div className="h-2 rounded-full bg-primary-500" style={{ width: `${(row.total / max) * 100}%` }} /></div>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

function Loading() {
  return <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</p>;
}
