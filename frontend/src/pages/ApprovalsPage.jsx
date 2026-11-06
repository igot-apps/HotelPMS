import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Search, RefreshCw, X, ArrowRight, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';
import { correctionLabels, approvalStatusLabel } from '../lib/correction-actions';
import { RequestCard } from '../components/reservations/CorrectionRequests';
import RefundCompletionDialog from '../components/reservations/RefundCompletionDialog';

const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text disabled:opacity-50';
function waitingSince(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Requested just now';
  if (minutes < 60) return `Requested ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `Requested ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(minutes / 1440);
  return `Requested ${days} day${days === 1 ? '' : 's'} ago`;
}
function ReviewPanel({ id, onClose, user }) {
  const panel = useRef(null), closeButton = useRef(null), dismiss = useRef(null);
  const [busy, setBusy] = useState(false);
  dismiss.current = () => { if (!busy) onClose(); };
  const detail = useQuery({ queryKey: ['correctionRequests', 'detail', user.propertyId, user.userId, id], queryFn: async () => (await api.get(`/reservations/approval-inbox/${id}`)).data.data, refetchInterval: 15000 });
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const handler = event => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss.current?.(); }
      if (event.key !== 'Tab') return;
      const items = [...(panel.current?.querySelectorAll('button:not(:disabled), a[href], select:not(:disabled), textarea:not(:disabled), input:not(:disabled)') || [])];
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus?.(); };
  }, []);
  return <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-labelledby="approval-review-title">
    <section ref={panel} className="flex h-dvh w-full min-w-0 flex-col bg-background shadow-2xl sm:max-w-xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface p-4 sm:px-6"><div><h2 id="approval-review-title" className="text-lg font-bold text-text">{detail.data?.status === 'Pending' ? 'Review request' : detail.data?.action === 'refund' && detail.data?.status === 'Approved' ? 'Record money returned' : 'Request details'}</h2><p className="text-sm text-text-muted">Request #{id}</p></div><button ref={closeButton} disabled={busy} onClick={() => dismiss.current()} aria-label="Close request review" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text disabled:opacity-50"><X size={20} /></button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
        {detail.isLoading && <p role="status" className="text-sm text-text-muted">Loading request…</p>}
        {detail.isError && <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">Could not load the latest request. <button onClick={() => detail.refetch()} className="min-h-11 underline">Try again</button></div>}
        {detail.data && !detail.isError && <RequestCard key={`${id}-${detail.data.status}-${detail.data.needsReview}`} request={detail.data} manager onReviewed={onClose} onBusyChange={setBusy} />}
      </div>
    </section>
  </div>;
}
export default function ApprovalsPage() {
  const user = useAuthStore(state => state.user);
  const manager = user?.role === 'Manager';
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const history = params.get('view') === 'history';
  const toReturn = params.get('view') === 'to-return';
  const view = history ? 'history' : toReturn ? 'to-return' : 'pending';
  const search = params.get('search') || '';
  const action = params.get('action') || '';
  const status = toReturn ? 'ToReturn' : history ? params.get('status') || 'History' : 'Pending';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [draft, setDraft] = useState(search);
  const [selected, setSelected] = useState(null);
  const [selectedRefund, setSelectedRefund] = useState(null);
  useEffect(() => { setDraft(search); }, [search]);
  const update = values => setParams(current => { const next = new URLSearchParams(current); next.delete('page'); for (const [key, value] of Object.entries(values)) { if (value) next.set(key, String(value)); else next.delete(key); } return next; });
  const query = useQuery({ queryKey: ['correctionRequests', 'inbox', user?.propertyId, user?.userId, status, search, action, page], enabled: manager, queryFn: async () => (await api.get('/reservations/approval-inbox', { params: { status, search, action, page, limit: 20 } })).data.data, refetchInterval: 30000 });
  const totalPages = query.data?.pagination.totalPages;
  useEffect(() => {
    if (totalPages === undefined || page <= Math.max(1, totalPages)) return;
    setParams(current => { const next = new URLSearchParams(current); next.set('page', String(Math.max(1, totalPages))); return next; }, { replace: true });
  }, [page, totalPages, setParams]);
  if (!manager) return <Navigate to="/dashboard" replace />;
  const data = query.data;
  const filtered = Boolean(search || action || (history && status !== 'History'));
  const clearFilters = () => { setDraft(''); update({ search: '', action: '', status: '' }); };
  return <>
    <div className="space-y-5" inert={selected || selectedRefund ? true : undefined}>
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-text"><ClipboardCheck className="text-primary-600" />Approvals</h1><p className="mt-1 text-sm text-text-muted">Review corrections and refunds from your team in one place.</p></div><button disabled={query.isFetching} onClick={() => client.invalidateQueries({ queryKey: ['correctionRequests'] })} className={buttonClass}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : ''} />Refresh</button></header>
      <div className="flex gap-1 overflow-x-auto border-b border-border" role="group" aria-label="Approval views">{[['pending', 'Pending', data?.counts.pending], ['to-return', 'To return', data?.counts.toReturn], ['history', 'History', data?.counts.history]].map(([value, label, count]) => <button key={value} aria-pressed={view === value} onClick={() => update({ view: value === 'pending' ? '' : value, status: '' })} className={`flex min-h-12 items-center gap-2 shrink-0 border-b-2 px-3 text-sm font-semibold ${view === value ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-muted'}`}>{label}<span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs">{count ?? '…'}</span></button>)}</div>
      <form onSubmit={event => { event.preventDefault(); update({ search: draft.trim() }); }} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="min-w-0 text-sm text-text sm:col-span-2 lg:col-span-1">Search requests<div className="mt-1 flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={100} placeholder="Guest, booking, room or staff" className={inputClass} /><button aria-label="Search approvals" className={buttonClass}><Search size={18} /></button></div></label>
        <label className="min-w-0 text-sm text-text">Action<select value={action} onChange={event => update({ action: event.target.value })} className={`${inputClass} mt-1`}><option value="">All actions</option>{Object.entries(correctionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {history ? <label className="min-w-0 text-sm text-text">Status<select value={status} onChange={event => update({ status: event.target.value })} className={`${inputClass} mt-1`}><option value="History">All reviewed requests</option>{['Approved', 'Completed', 'Simulated', 'Rejected', 'Withdrawn'].map(value => <option key={value}>{value}</option>)}</select></label> : <p className="flex items-end pb-2 text-sm text-text-muted"><Clock size={16} className="mr-2 shrink-0" />{toReturn ? 'Approved refunds awaiting money return' : 'Oldest requests first'}</p>}
        {filtered && <button type="button" onClick={clearFilters} className="min-h-11 justify-self-start text-sm font-semibold text-primary-700 underline">Clear filters</button>}
      </form>
      {query.isLoading && <p role="status" className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">Loading approval requests…</p>}
      {query.isError && <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">Could not refresh approvals. <button onClick={() => query.refetch()} className="min-h-11 underline">Try again</button></div>}
      {data && !query.isError && <>
        <p aria-live="polite" className="text-sm text-text-muted">{data.pagination.total} {data.pagination.total === 1 ? 'request' : 'requests'}{filtered && ' matching your filters'}</p>
        {!data.items.length && <div className="space-y-2 rounded-xl border border-border bg-surface p-8 text-center"><CheckCircle2 className="mx-auto text-primary-600" size={30} /><h2 className="font-bold text-text">{filtered ? 'No matching requests' : history ? 'No reviewed requests yet' : 'All caught up'}</h2><p className="text-sm text-text-muted">{filtered ? 'Try another search or clear the filters.' : history ? 'Approved, rejected and withdrawn requests appear here.' : toReturn ? 'There are no approved refunds awaiting money return.' : 'There are no requests waiting for your approval.'}</p>{filtered && <button onClick={clearFilters} className={buttonClass}>Clear filters</button>}</div>}
        <div className="grid gap-3 lg:grid-cols-2">{data.items.map(request => <button key={request.requestId} onClick={() => request.action === 'refund' && request.status === 'Approved' ? setSelectedRefund(request) : setSelected(request.requestId)} className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 text-left text-sm text-text transition hover:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><span className="min-w-0 break-words text-base font-bold">{request.guestName}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.needsReview ? 'bg-amber-100 text-amber-900' : request.status === 'Pending' ? 'bg-primary-50 text-primary-700' : 'bg-secondary-100 text-text-muted'}`}>{request.needsReview ? 'Needs review' : approvalStatusLabel(request)}</span></div>
          <p className="font-semibold">{correctionLabels[request.action] || request.action}{request.action === 'refund' && ` · GHS ${Number(request.input.amount).toFixed(2)}`}</p>{request.input.mode === 'SimulatedMoMo' && <p className="text-xs font-bold text-amber-800">TEST · MoMo simulation · no real money</p>}<p className="break-words text-text-muted">{request.roomLabel || 'Whole reservation'} · {request.reservation.confirmationCode}</p>
          <p className="line-clamp-2 break-words">{request.input.reason}</p>
          {request.needsReview && <p className="flex items-center gap-2 text-xs text-amber-800"><AlertTriangle size={15} className="shrink-0" />Reservation changed since this request</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><div className="min-w-0"><p className="break-words text-xs text-text-muted">From {request.requester?.fullName || 'Former staff'}</p><time dateTime={request.status === 'Pending' ? request.createdAt : request.reviewedAt} title={new Date(request.createdAt).toLocaleString()} className="text-xs font-semibold">{request.status === 'Pending' ? waitingSince(request.createdAt) : `Reviewed ${new Date(request.reviewedAt).toLocaleDateString()}`}</time></div><span className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary-700">{request.status === 'Pending' ? 'Review request' : request.action === 'refund' && request.status === 'Approved' ? 'Record money returned' : 'View details'}<ArrowRight size={16} /></span></div>
        </button>)}</div>
        {data.pagination.totalPages > 1 && <nav aria-label="Approval pages" className="flex flex-wrap items-center justify-between gap-3"><button disabled={page <= 1} onClick={() => update({ page: page - 1 })} className={buttonClass}>Previous</button><span className="text-sm text-text-muted">Page {page} of {data.pagination.totalPages}</span><button disabled={page >= data.pagination.totalPages} onClick={() => update({ page: page + 1 })} className={buttonClass}>Next</button></nav>}
        {!data.items.length && page > 1 && <button onClick={() => update({ page: 1 })} className={buttonClass}>Back to first page</button>}
      </>}
    </div>
    {selected && <ReviewPanel key={selected} id={selected} user={user} onClose={() => setSelected(null)} />}
    {selectedRefund && <RefundCompletionDialog request={selectedRefund} onClose={() => setSelectedRefund(null)} onCompleted={() => query.refetch()} />}
  </>;
}
