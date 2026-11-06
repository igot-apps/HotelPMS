import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import useRefundSimulation from '../../hooks/useRefundSimulation';
export default function RefundSimulationSettings() {
  const user = useAuthStore(state => state.user);
  const query = useRefundSimulation();
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: enabled => api.put('/reservations/refund-simulation/settings', { enabled }), onSuccess: (_,enabled) => { client.invalidateQueries({queryKey:['refunds']}); toast.success(enabled ? 'MoMo refund simulation enabled. No real money will be sent.' : 'MoMo refund simulation switched off.'); }, onError: e => toast.error(e.response?.data?.message || 'Could not update simulation settings.') });
  return <section className="min-w-0 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><h2 className="font-bold">MoMo refund simulation</h2><p className="text-sm">Manager approval marks a test refund as sent. No real money moves.</p>{query.isPending ? <p className="text-sm">Loading settings…</p> : query.isError ? <p role="alert" className="text-sm">Could not load simulation settings. <button onClick={() => query.refetch()} className="min-h-11 underline">Try again</button></p> : user?.role === 'Manager' ? <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 shrink-0" checked={query.data.enabled} disabled={mutation.isPending} onChange={e => mutation.mutate(e.target.checked)} />{mutation.isPending ? 'Saving…' : query.data.enabled ? 'Simulation enabled' : 'Enable simulation'}</label> : <p className="text-sm font-semibold">{query.data.enabled ? 'Simulation enabled by your manager' : 'Simulation is switched off'}</p>}<p className="text-xs">Requires a saved Ghana mobile number. Wallet ownership is not verified.</p></section>;
}
