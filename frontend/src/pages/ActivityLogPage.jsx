import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../lib/axios';
import { addDays, defaultToday } from '../lib/period';
import useServerClock from '../lib/useServerClock';
import { useAuthStore } from '../store/authStore';
import { Skeleton } from '../components/ui/Skeleton';

const KINDS = [
  ['', 'Everything'], ['stays', 'Check-in, checkout & rooms'], ['bookings', 'Bookings & cancellations'],
  ['money', 'Payments, refunds & cash'], ['corrections', 'Corrections'], ['settings', 'Settings & staff'],
];
const TONE = {
  stays: 'bg-primary-50 text-primary-700', bookings: 'bg-secondary-100 text-secondary-700', money: 'bg-success-50 text-success-700',
  corrections: 'bg-warning-50 text-warning-700', settings: 'bg-secondary-100 text-secondary-700',
};
const field = 'px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20';

// Manager only: everything staff did in the hotel, so nothing is missed. Read-only.
export default function ActivityLogPage() {
  const user = useAuthStore((state) => state.user);
  useServerClock(); // the default period follows the server's date
  const today = defaultToday();
  const [picked, setPicked] = useState({ from: null, to: null });
  const from = picked.from ?? addDays(today, -6);
  const to = picked.to ?? today;
  const [staffId, setStaffId] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const change = (update) => { update(); setPage(1); };

  const isManager = user?.role === 'Manager';
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['activityLog', from, to, staffId, kind, page],
    queryFn: async () => (await api.get('/reports/activity', { params: { from, to, staffId: staffId || undefined, kind: kind || undefined, page } })).data.data,
    enabled: isManager, placeholderData: keepPreviousData,
  });

  if (!isManager) return <div className="p-8 text-center text-text-muted">Only the hotel manager can view the activity log.</div>;

  const time = (at) => new Date(at).toLocaleString('en-GB', { timeZone: data?.timeZone || 'Africa/Accra', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text"><History size={22} className="text-primary-600" /> Activity log</h1>
        <p className="mt-1 text-sm text-text-muted">Everything staff did in this hotel, newest first: bookings, check-ins and checkouts, payments, refunds, corrections and settings.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="text-xs font-semibold text-text-muted">From<input type="date" value={from} max={to} onChange={e => change(() => setPicked(p => ({ ...p, from: e.target.value || null })))} className={`mt-1 block ${field}`} /></label>
        <label className="text-xs font-semibold text-text-muted">To<input type="date" value={to} min={from} onChange={e => change(() => setPicked(p => ({ ...p, to: e.target.value || null })))} className={`mt-1 block ${field}`} /></label>
        <label className="text-xs font-semibold text-text-muted">Staff<select value={staffId} onChange={e => change(() => setStaffId(e.target.value))} className={`mt-1 block ${field}`}>
          <option value="">All staff</option>
          {(data?.staff || []).map(s => <option key={s.userId} value={s.userId}>{s.fullName} ({s.role}{s.isActive ? '' : ', inactive'})</option>)}
        </select></label>
        <label className="text-xs font-semibold text-text-muted">Type<select value={kind} onChange={e => change(() => setKind(e.target.value))} className={`mt-1 block ${field}`}>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {isFetching && !isLoading && <span className="text-xs text-text-muted">Updating…</span>}
      </div>

      {isLoading ? <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        : isError ? <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{error?.response?.data?.message || 'Could not load the activity log.'}</div>
        : !data.items.length ? <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">No staff activity in this period.</div>
        : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <p className="border-b border-border px-4 py-2 text-xs text-text-muted">{data.total} {data.total === 1 ? 'entry' : 'entries'} · {data.from} to {data.to}</p>
            <ul className="divide-y divide-border">
              {data.items.map(item => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="w-32 shrink-0 text-xs text-text-muted">{time(item.at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text"><span className={`mr-2 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${TONE[item.kind]}`}>{item.label}</span><span className="font-semibold">{item.staffName}</span></p>
                    {item.detail && <p className="mt-1 break-words text-xs text-text-muted">{item.detail}</p>}
                  </div>
                  {item.reservationId && <Link to={`/reservations/${item.reservationId}`} className="shrink-0 text-xs font-semibold text-primary-700 hover:underline">{item.confirmationCode}{item.guestName ? ` · ${item.guestName}` : ''}</Link>}
                </li>
              ))}
            </ul>
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-muted">
                <span>Page {data.page} of {data.totalPages}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="inline-flex min-h-9 items-center rounded-lg border border-border px-2 disabled:opacity-40"><ChevronLeft size={14} /> Newer</button>
                  <button type="button" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="inline-flex min-h-9 items-center rounded-lg border border-border px-2 disabled:opacity-40">Older <ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
