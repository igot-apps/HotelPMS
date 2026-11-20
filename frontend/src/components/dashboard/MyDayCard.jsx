import { SkeletonCards } from '../ui/Skeleton';
import { useQuery } from '@tanstack/react-query';
import { Coins, LogIn, LogOut, Plus, UserCheck } from 'lucide-react';
import api from '../../lib/axios';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// "What did I handle today?" — the signed-in staff member's own work since midnight (hotel time).
export default function MyDayCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['myDay'],
    queryFn: async () => (await api.get('/dashboard/my-day', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  if (isError) return null;
  const items = data ? [
    { icon: LogIn, label: 'Checked in', value: plural(data.checkIns.bookings, 'booking'), hint: plural(data.checkIns.rooms, 'room') },
    { icon: LogOut, label: 'Checked out', value: plural(data.checkOuts.bookings, 'booking'), hint: plural(data.checkOuts.rooms, 'room') },
    { icon: Plus, label: 'New bookings', value: String(data.bookingsMade), hint: 'made by you' },
    { icon: Coins, label: 'Money you took', value: cash(data.payments.total), hint: plural(data.payments.count, 'payment') },
  ] : [];
  return (
    <section aria-labelledby="my-day-title" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 id="my-day-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-text"><UserCheck size={17} className="text-primary-600" /> You today</h2>
      {isLoading ? <SkeletonCards count={4} className="grid grid-cols-2 gap-3 lg:grid-cols-4" cardClassName="h-16" label="Loading your day…" /> : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map(({ icon: Icon, label, value, hint }) => (
            <li key={label} className="min-w-0 rounded-lg border border-border bg-background p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted"><Icon size={14} /> {label}</p>
              <p className="mt-1 break-words text-lg font-bold text-text">{value}</p>
              <p className="text-xs text-text-muted">{hint}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
