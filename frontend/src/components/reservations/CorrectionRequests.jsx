import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import ReasonSelect from './ReasonSelect';
import { correctionLabels, invalidateCorrections, approvalStatusLabel } from '../../lib/correction-actions';
import RefundCompletionForm from './RefundCompletionForm';

export function CorrectionImpact({ preview }) {
  return <div role="status" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{preview.roomLabel && <p className="font-semibold">{preview.roomLabel}</p>}<p>{preview.message}</p>{preview.newTotal !== undefined && <p>Total: GHS {preview.oldTotal.toFixed(2)} → {preview.newTotal.toFixed(2)}. Balance: GHS {preview.balanceDue.toFixed(2)}. Credit for review: GHS {preview.credit.toFixed(2)}.</p>}{preview.newAmount !== undefined && <p>Payment: GHS {preview.oldAmount.toFixed(2)} → {preview.newAmount.toFixed(2)}. Revised paid total: GHS {preview.newPaid.toFixed(2)}.</p>}</div>;
}
export function RequestCard({ request, manager, onReviewed, onBusyChange }) {
  const client = useQueryClient();
  const role = useAuthStore(state => state.user?.role);
  const canRecordRefund = manager || role === 'Receptionist';
  const [preview, setPreview] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState(false);
  const mutation = useMutation({
    mutationFn: async decision => (await api.post(`/reservations/correction-requests/${request.requestId}/${decision === 'preview' ? 'preview' : 'review'}`, { decision, expectedVersion: preview?.version, reason })).data.data,
    onSuccess: (result, decision) => { setError(''); if (decision === 'preview') { setPreview(result); return; } invalidateCorrections(client); setPreview(null); toast.success(decision === 'approve' ? request.action === 'refund' ? result.status === 'Simulated' ? 'MoMo refund simulated. No money sent.' : 'Refund approved. Money still needs to be returned.' : 'Approved and applied. History updated.' : decision === 'reject' ? 'Request rejected.' : 'Request withdrawn.'); onReviewed?.(result); },
    onError: e => { setPreview(null); setError(e.response?.data?.message || 'Could not process this request. Try again.'); },
  });
  useEffect(() => { onBusyChange?.(mutation.isPending || completing); }, [mutation.isPending, completing, onBusyChange]);
  return <article className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 text-sm text-text">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{correctionLabels[request.action] || request.action}</p><Link to={`/reservations/${request.reservationId}`} className="break-all text-primary-700 underline">{request.reservation?.confirmationCode || 'Open reservation'}</Link></div><span className="rounded bg-secondary-50 px-2 py-1 font-semibold">{request.action === 'refund' ? approvalStatusLabel(request) : request.status === 'Pending' ? 'Awaiting manager approval' : request.status}</span></div>
    {request.action === 'refund' && <p className="font-bold">GHS {Number(request.input.amount).toFixed(2)} · Original payment #{request.input.paymentId}</p>}
    {request.action === 'refund' && request.status === 'Approved' && <><p className="rounded-lg bg-amber-50 p-3 text-amber-900">Approval is complete. The refund has not been recorded as returned.</p>{canRecordRefund && <fieldset disabled={mutation.isPending || rejecting} className="min-w-0"><RefundCompletionForm request={request} onCompleted={onReviewed} onBusyChange={setCompleting} /></fieldset>}{manager && <>{rejecting ? <div className="space-y-2"><ReasonSelect action="reject-correction" value={reason} onChange={setReason} disabled={mutation.isPending || completing} className="min-h-11 w-full rounded-lg border border-border p-2" /><button disabled={mutation.isPending || completing || reason.trim().length < 5} onClick={() => mutation.mutate('reject')} className="min-h-11 rounded-lg border border-danger-200 px-3 text-danger-700">Confirm cancellation of approval</button></div> : <button disabled={completing} onClick={() => setRejecting(true)} className="min-h-11 text-danger-700 underline">Cancel refund approval</button>}</>}</>}
    {request.input.mode === 'SimulatedMoMo' && <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"><p className="font-bold">TEST · MoMo refund to {request.input.recipientPhone}</p><p>{request.status === 'Simulated' ? (request.input.simulation?.balancesApplied ? 'Sent (simulation). The booking test balance has been updated. No real money was transferred.' : 'Previous simulation preview only. No money sent.') : 'Manager approval marks the test refund as sent. No real money will be transferred.'}</p>{request.input.simulation && <p className="break-all text-xs">Simulation reference: {request.input.simulation.reference}</p>}</div>}
    {request.refund && <div className="rounded-lg border border-border p-3"><p>{request.refund.isSimulated ? 'Sent (simulation) via ' : 'Returned via '}{request.refund.method} · {new Date(request.refund.returnedAt).toLocaleString()}</p><p className="break-all">Reference: {request.refund.reference || 'Not provided'}</p><p>Recorded by {request.refund.returnedByName}</p></div>}
    <p className="text-text-muted">Requested by {request.requester?.fullName || 'Former staff'} · {new Date(request.createdAt).toLocaleString()}</p>
    {request.guestName && <p className="font-semibold">Booking contact: {request.guestName}</p>}
    {request.needsReview && <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">Reservation changed — needs review. Reject this request and ask for an updated one.</p>}
    <p className="break-words">{request.input.reason}</p>
    {(request.roomLabel || request.input.roomLabel || request.input.stayId) && <p>{request.roomLabel || request.input.roomLabel || `Room stay #${request.input.stayId}`}{request.input.targetRoomLabel && ` → ${request.input.targetRoomLabel}`}</p>}
    {request.input.newCheckOutDate && <p>Requested departure: {request.input.newCheckOutDate}</p>}
    {request.action === 'correct-payment' && <p>Payment #{request.input.paymentId} → GHS {Number(request.input.newAmount).toFixed(2)}</p>}
    {request.reviewer && <p className="text-text-muted">{request.status === 'Withdrawn' ? 'Withdrawn' : 'Reviewed'} by {request.reviewer.fullName} · {new Date(request.reviewedAt).toLocaleString()}</p>}
    {request.reviewReason && <p>Reason: {request.reviewReason}</p>}
    {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-danger-700">{error}</p>}
    {request.status === 'Pending' && <>
      {preview && <CorrectionImpact preview={preview} />}
      {rejecting && <ReasonSelect action="reject-correction" value={reason} onChange={setReason} disabled={mutation.isPending} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" />}
      <div className="flex flex-wrap gap-2">
        {manager ? <><button disabled={mutation.isPending || rejecting || request.needsReview} onClick={() => mutation.mutate(preview ? 'approve' : 'preview')} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Checking…' : preview ? request.action === 'refund' ? request.input.mode === 'SimulatedMoMo' ? 'Approve and simulate MoMo' : 'Approve refund' : 'Approve and apply' : 'Review impact'}</button>{rejecting ? <><button disabled={mutation.isPending || reason.trim().length < 5} onClick={() => mutation.mutate('reject')} className="min-h-11 rounded-lg border border-danger-200 px-4 py-2 text-danger-700 disabled:opacity-50">Confirm rejection</button><button disabled={mutation.isPending} onClick={() => setRejecting(false)} className="min-h-11 px-3">Back</button></> : <button disabled={mutation.isPending} onClick={() => { setRejecting(true); setPreview(null); }} className="min-h-11 rounded-lg border border-border px-4 py-2">Reject request</button>}</> : <button disabled={mutation.isPending} onClick={() => mutation.mutate('withdraw')} className="min-h-11 rounded-lg border border-border px-4 py-2">Withdraw request</button>}
      </div>
    </>}
  </article>;
}
export default function CorrectionRequests({ reservationId, onPendingChange }) {
  const user = useAuthStore(state => state.user);
  const manager = user?.role === 'Manager';
  const query = useQuery({ queryKey: ['correctionRequests', user?.propertyId, user?.userId, reservationId || 'pending'], queryFn: async () => (await api.get('/reservations/correction-requests', { params: { reservationId } })).data.data, refetchInterval: 30000 });
  const requests = query.data || [];
  useEffect(() => { onPendingChange?.(Boolean(query.data?.some(request => request.status === 'Pending' && request.requestedBy === user?.userId))); }, [query.data, user?.userId, onPendingChange]);
  if (!reservationId && !query.isLoading && !query.isError && !requests.length) return null;
  return <section className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-6">
    <h3 className="font-bold text-text">{reservationId ? 'Approval requests' : manager ? 'Corrections awaiting your approval' : 'Your pending correction requests'}{requests.length > 0 && ` (${requests.length})`}</h3>
    {query.isLoading && <p className="text-sm text-text-muted">Loading requests…</p>}
    {query.isError && <div role="alert" className="text-sm text-danger-700">Could not load approval requests. <button onClick={() => query.refetch()} className="min-h-11 underline">Try again</button></div>}
    {!query.isLoading && !query.isError && !requests.length && <p className="text-sm text-text-muted">No approval requests for this reservation.</p>}
    {requests.map(request => <RequestCard key={`${request.requestId}-${request.status}`} request={request} manager={manager} />)}
  </section>;
}

