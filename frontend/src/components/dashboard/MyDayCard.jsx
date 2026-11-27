import { SkeletonCards } from '../ui/Skeleton';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Coins, LogIn, LogOut, Plus, UserCheck } from 'lucide-react';
import api from '../../lib/axios';
import { Drawer } from './TodayAtAGlance';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const time = (at) => (at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

// "What did I handle today?" — the signed-in staff member's own work since midnight (hotel time).
export default function MyDayCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['myDay'],
    queryFn: async () => (await api.get('/dashboard/my-day', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const [open, setOpen] = useState(null);
  if (isError) return null;
  const lists = data?.lists || {};
  const items = data ? [
    { key: 'checkIns', icon: LogIn, label: 'Checked in', value: plural(data.checkIns.bookings, 'booking'), hint: plural(data.checkIns.rooms, 'room'), title: 'Bookings you checked in today', empty: 'You have not checked anyone in today.' },
    { key: 'checkOuts', icon: LogOut, label: 'Checked out', value: plural(data.checkOuts.bookings, 'booking'), hint: plural(data.checkOuts.rooms, 'room'), title: 'Bookings you checked out today', empty: 'You have not checked anyone out today.' },
    { key: 'bookings', icon: Plus, label: 'New bookings', value: String(data.bookingsMade), hint: 'made by you', title: 'Bookings you made today', empty: 'You have not made a booking today.' },
    { key: 'payments', icon: Coins, label: 'Money you took', value: cash(data.payments.total), hint: plural(data.payments.count, 'payment'), title: 'Payments you took today', empty: 'You have not taken a payment today.' },
  ] : [];
  const current = items.find((item) => item.key === open);
  const rows = current ? lists[current.key] || [] : [];
  return (
    <section aria-labelledby="my-day-title" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 id="my-day-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-text"><UserCheck size={17} className="text-primary-600" /> You today</h2>
      {isLoading ? <SkeletonCards count={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" cardClassName="h-16" label="Loading your day…" /> : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map(({ icon: Icon, label, value, hint }) => (
            <li key={label} className="min-w-0">
              <button type="button" onClick={() => setOpen(items.find((item) => item.label === label).key)} className="group h-full w-full rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-primary-500">
                <span className="flex items-center justify-between gap-1.5 text-xs font-semibold text-text-muted"><span className="flex items-center gap-1.5"><Icon size={14} /> {label}</span><ChevronRight size={14} className="opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
                <span className="mt-1 block break-words text-lg font-bold text-text">{value}</span>
                <span className="block text-xs text-text-muted">{hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <Drawer title={current.title} onClose={() => setOpen(null)}>
          {rows.length === 0 ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">{current.empty}</p> : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.paymentId || row.reservationId} className="rounded-lg border border-border">
                  <Link to={`/bookings/${row.reservationId}`} className="flex items-center justify-between gap-3 rounded-lg p-3 hover:bg-primary-50/30">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-text">{current.key === 'payments' ? `${cash(row.amount)} · ${row.method}` : row.guestName}</span>
                      <span className="block truncate text-xs text-text-muted">{[current.key === 'payments' ? row.guestName : null, row.confirmationCode, row.rooms ? plural(row.rooms, 'room') : null, time(row.at)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Drawer>
      )}
    </section>
  );
}
