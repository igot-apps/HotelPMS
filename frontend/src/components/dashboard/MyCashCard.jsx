import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Banknote, Loader2 } from 'lucide-react';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (value) => `${Number(value) > 0 ? '+' : Number(value) < 0 ? '−' : ''}${cash(Math.abs(Number(value || 0)))}`;
const time = (value) => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// End of day: each staff member counts the cash they took and records it. Saved counts are never changed.
export default function MyCashCard() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashRecon', 'today'],
    queryFn: async () => (await api.get('/dashboard/cash', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const save = useMutation({
    mutationFn: async () => (await api.post('/dashboard/cash-counts', { countedAmount: Number(amount), note }, { skipErrorToast: true })).data.data,
    onSuccess: (result) => {
      toast.success(Number(result.difference) === 0 ? 'Cash count saved. It matches.' : `Cash count saved. Difference: ${signed(result.difference)}.`);
      setAmount(''); setNote('');
      queryClient.invalidateQueries({ queryKey: ['cashRecon'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not save the cash count.'),
  });
  if (isError) return null;
  const mine = data?.staff?.find((row) => row.userId === user?.userId);
  const latest = mine?.latestCount;
  const valid = amount !== '' && /^\d+(\.\d{1,2})?$/.test(amount);

  return (
    <section aria-labelledby="my-cash-title" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 id="my-cash-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-text"><Banknote size={17} className="text-primary-600" /> Your cash today</h2>
      {isLoading ? <p className="text-sm text-text-muted">Loading…</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="text-text-muted">Cash you should have</p>
            <p className="text-2xl font-bold text-text">{cash(mine?.expectedCash)}</p>
            <p className="text-xs text-text-muted">{cash(mine?.cashTaken)} cash taken − {cash(mine?.cashRefunded)} cash refunds. Mobile Money, card and online payments are not counted here.</p>
            {latest ? (
              <p className={`mt-2 rounded-lg p-2 text-sm ${Number(mine.differenceNow) === 0 ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
                Last count {time(latest.recordedAt)}: <strong>{cash(latest.countedAmount)}</strong> · {Number(mine.differenceNow) === 0 ? 'matches' : `difference ${signed(mine.differenceNow)}`}
                {mine.changedSinceCount && <span className="block text-xs">Payments changed after that count (expected was {cash(latest.expectedAmount)} then).</span>}
              </p>
            ) : <p className="mt-2 text-xs text-text-muted">Not counted yet today.</p>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (valid && !save.isPending) save.mutate(); }} className="space-y-2">
            <label className="block text-sm font-semibold text-text">Cash you counted (GHS)
              <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={Number(mine?.expectedCash || 0).toFixed(2)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base text-text" />
            </label>
            <label className="block text-sm font-semibold text-text">Note <span className="font-normal text-text-muted">(optional)</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="e.g. GHS 50 given to manager" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text" />
            </label>
            <button disabled={!valid || save.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {save.isPending && <Loader2 size={16} className="animate-spin" />} Save cash count
            </button>
            <p className="text-xs text-text-muted">Each count is kept. Counting again adds a new count; it does not replace the earlier one.</p>
          </form>
        </div>
      )}
    </section>
  );
}
