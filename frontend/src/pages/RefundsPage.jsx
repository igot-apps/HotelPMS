import RefundSimulationSettings from '../components/reservations/RefundSimulationSettings';
import { useState, useEffect } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Undo2, ArrowRight, RefreshCw } from 'lucide-react';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import { approvalStatusLabel } from '../lib/correction-actions';
const tabs = [['Approved', 'Ready to return', 'ready'], ['Pending', 'Awaiting approval', 'pending'], ['History', 'History', 'history']];
export default function RefundsPage() {
  const user = useAuthStore(state => state.user);
  const [params, setParams] = useSearchParams();
  const status = tabs.some(([key]) => key === params.get('status')) ? params.get('status') : 'Approved';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const allowed = ['Manager', 'Receptionist'].includes(user?.role);
  const query = useQuery({ queryKey: ['refunds', 'inbox', user?.propertyId, user?.userId, status, debounced, page], enabled: allowed, queryFn: async () => (await api.get('/reservations/refund-inbox', { params: { status, search: debounced, page, limit: 20 } })).data.data, refetchInterval: 15000 });
  if (!allowed) return <Navigate to="/dashboard" replace />;
  const counts = query.data?.counts;
  const pagination = query.data?.pagination;
  return <div className="min-w-0 space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-text"><Undo2 size={25} />Refunds</h1><p className="mt-1 text-sm text-text-muted">Approved refunds across your hotel, ready for the front desk to return.</p></div><button onClick={() => query.refetch()} disabled={query.isFetching} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text disabled:opacity-50"><RefreshCw size={16} />Refresh</button></div>
    <RefundSimulationSettings />
    <div role="tablist" aria-label="Refund status" className="flex flex-wrap gap-2">{tabs.map(([key,label,count]) => <button key={key} role="tab" aria-selected={status === key} onClick={() => { setPage(1); setParams({ status: key }); }} className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${status === key ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-surface text-text'}`}>{label}{counts && ` (${counts[count]})`}</button>)}</div>
    <label className="block text-sm font-medium text-text">Find a refund<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Guest name or reservation code" className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface p-3" /></label>
    {query.isError && <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">Could not load refunds. <button onClick={() => query.refetch()} className="min-h-11 underline">Try again</button></p>}
    {query.isPending && <p className="text-sm text-text-muted">Loading refunds…</p>}
    {query.data && !query.data.items.length && <p className="rounded-xl border border-border bg-surface p-6 text-text-muted">{debounced ? 'No refunds match your search.' : status === 'Approved' ? 'No approved refunds waiting to be returned.' : status === 'Pending' ? 'No refunds awaiting manager approval.' : 'No refund history yet.'}</p>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{query.data?.items.map(item => <article key={item.requestId} className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-bold text-text">{item.guestName}</h2><p className="mt-1 break-all text-xs text-text-muted">{item.reservation.confirmationCode}</p></div><strong className="text-lg text-text">GHS {Number(item.input.amount).toFixed(2)}</strong></div><p className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${item.status === 'Approved' ? 'bg-primary-50 text-primary-800' : 'bg-secondary-50 text-text'}`}>{approvalStatusLabel(item)}</p><p className="break-words text-sm text-text-muted">{item.input.reason}</p>{item.input.mode === 'SimulatedMoMo' && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">TEST MoMo to {item.input.recipientPhone}. {item.status === 'Simulated' ? item.input.simulation?.balancesApplied ? 'Sent (simulation). Booking test balance updated; no real money transferred.' : 'Previous simulation preview only; no money sent.' : 'Manager approval runs a simulation only.'}</p>}<p className="text-xs text-text-muted">Requested by {item.requester?.fullName || 'Former staff'}</p>{item.reviewer && <p className="text-xs text-text-muted">{item.status === 'Completed' || item.status === 'Approved' ? 'Approved' : 'Reviewed'} by {item.reviewer.fullName} · {new Date(item.reviewedAt).toLocaleString()}</p>}{item.refund && <p className="text-xs text-text-muted">{item.refund.isSimulated ? 'Sent (simulation) ' : 'Returned '}{new Date(item.refund.returnedAt).toLocaleString()} · Recorded by {item.refund.returnedByName}</p>}<Link to={`/reservations/${item.reservationId}#refunds`} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${status === 'Approved' ? 'border-primary-600 bg-primary-600 text-white' : 'border-border text-primary-700'}`}>{status === 'Approved' ? 'Record money returned' : 'View refund details'}<ArrowRight size={16} /></Link></article>)}</div>
    {pagination && pagination.totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3"><button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="min-h-11 rounded-lg border border-border px-3 text-text disabled:opacity-40">Previous</button><span className="text-sm text-text-muted">Page {page} of {pagination.totalPages}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p+1)} className="min-h-11 rounded-lg border border-border px-3 text-text disabled:opacity-40">Next</button></div>}
    <p className="text-xs text-text-muted">Updates every 15 seconds. Record completion only after the guest receives the money.</p>
  </div>;
}
