import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../../lib/serverClock';
import { fromHotelInput, toHotelInput } from '../../lib/stayTiming';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import ReasonSelect from './ReasonSelect';
import { RequestCard, CorrectionImpact } from './CorrectionRequests';
import { invalidateCorrections } from '../../lib/correction-actions';
const localNow = () => toHotelInput(serverNow(), undefined, true); // hotel time from the server; blank if unknown
export default function RefundPanel({ reservation, embedded = false }) {
  const user = useAuthStore(state => state.user);
  const client = useQueryClient();
  const mode = 'Manual'; // simulated MoMo refunds were removed
  const section = useRef(null);
  const location = useLocation();
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [preview, setPreview] = useState(null);
  const id = reservation.reservationId;
  const query = useQuery({ queryKey: ['refunds', id], queryFn: async () => (await api.get(`/reservations/${id}/refunds`)).data.data, refetchInterval: 30000 });
  useEffect(() => { if (!embedded && location.hash === '#refunds') section.current?.scrollIntoView({ block: 'start' }); }, [location.key, location.hash, embedded]);
  const [policyException, setPolicyException] = useState(false);
  const [returnMethod, setReturnMethod] = useState(''), [returnReference, setReturnReference] = useState(''), [returnedAt, setReturnedAt] = useState(localNow), [moneyReturned, setMoneyReturned] = useState(false), [providerConfirmed, setProviderConfirmed] = useState(false);
  // Front desk staff record refunds directly once the money is returned (no prior approval).
  const recordsReturn = mode === 'Manual';
  const mutation = useMutation({
    mutationFn: async apply => (await api.post(`/reservations/${id}/refund-requests`, {
      // No payment is chosen: the server takes the amount from the booking's payments (one refund record per payment).
      amount: Number(amount), reason, mode,
      preview: !apply, expectedVersion: apply ? preview?.version : undefined,
      ...(apply ? { recordDirectly: true } : {}),
      ...(apply && query.data?.nonRefundable ? { policyException } : {}),
      ...(apply && recordsReturn ? { method: returnMethod, reference: returnReference, returnedAt: fromHotelInput(returnedAt)?.toISOString(), moneyReturned, providerConfirmed } : {}),
    }, { skipErrorToast: true })).data.data,
    onSuccess: (result, apply) => {
      if (!apply) { setPreview(result); return; }
      setPreview(null);
      setAmount('');
      setReason('');
      setReturnMethod('');
      setReturnReference('');
      setReturnedAt(localNow());
      setMoneyReturned(false);
      setProviderConfirmed(false);
      setPolicyException(false);
      invalidateCorrections(client);
      const messages = { Completed: 'Refund recorded. Original payments preserved.', Simulated: 'Simulated refund completed. No money was sent.' };
      toast.success(messages[result.status] || 'Refund saved.');
    },
    onError: error => {
      setPreview(null);
      toast.error(error.response?.data?.message || 'Could not save the refund.');
    },
  });
  const change = setter => event => { setPreview(null); setter(event.target.value); };
  const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm text-text';
  const data = query.data;
  const available = data?.refundable || 0;
  const approvedTotal = data?.requests.filter(request => request.status === 'Approved').reduce((sum, request) => sum + Number(request.input?.amount || 0), 0) || 0;
  return <section ref={section} id={embedded ? undefined : "refunds"} className={embedded ? "min-w-0 space-y-4" : "scroll-mt-4 space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6"}>{!embedded && <h3 className="text-lg font-bold text-text">Refunds</h3>}
    {query.isLoading && <p className="text-sm text-text-muted">Loading refund balance…</p>}
    {query.isError && <p role="alert" className="text-sm text-danger-700">{query.error.response?.data?.message || 'Could not load refunds.'} <button onClick={() => query.refetch()} className="min-h-11 underline">Try again</button></p>}
    {data && <>{approvedTotal > 0 && <p role="status" className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-800"><strong>Refund approved · GHS {approvedTotal.toFixed(2)}</strong><span className="mt-1 block">Money has not been recorded as returned. Complete the approved request below after the guest receives it.</span></p>}<div className="grid gap-3 sm:grid-cols-2"><p className="rounded-lg border border-border p-3 text-sm text-text-muted">Available to request<strong className="mt-1 block text-lg text-text">GHS {data.refundable.toFixed(2)}</strong></p><p className="rounded-lg border border-border p-3 text-sm text-text-muted">Refunds completed<strong className="mt-1 block text-lg text-text">GHS {data.returnedTotal.toFixed(2)}</strong>{data.simulatedReturnedTotal > 0 && <span className="mt-1 block text-xs text-primary-700">Includes GHS {data.simulatedReturnedTotal.toFixed(2)} sent in simulation</span>}</p></div>
      {data.refundable > 0 ? <form onSubmit={event => { event.preventDefault(); mutation.mutate(Boolean(preview)); }} className="space-y-3"><h4 className="font-semibold text-text">Record a refund</h4><fieldset disabled={mutation.isPending} className="min-w-0 space-y-3"><p className="text-sm text-text-muted">Record money already returned to the guest.</p><div><label htmlFor="refund-amount" className="block text-sm text-text">Refund amount (GHS)</label><div className="mt-1 flex gap-2"><input id="refund-amount" required type="number" min="0.01" step="0.01" max={available || undefined} value={amount} onChange={change(setAmount)} className={`${field.replace('mt-1 ', '')} flex-1`} /><button type="button" disabled={!(available > 0) || mutation.isPending} onClick={() => { setPreview(null); setAmount(available.toFixed(2)); }} className="min-h-11 shrink-0 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-secondary-50 disabled:opacity-50">Full amount</button></div><span className="mt-1 block text-xs text-text-muted">Up to GHS {available.toFixed(2)}. Taken from the payments made at the hotel{data.payments.some(p => p.online) ? ' (online payments are non-refundable)' : ''}; the preview shows which.</span></div><ReasonSelect action="refund" value={reason} onChange={value => { setPreview(null); setReason(value); }} className={field} disabled={mutation.isPending} />{preview && <CorrectionImpact preview={preview} />}{preview && recordsReturn && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><label className="block text-sm text-text">Return method<select required value={returnMethod} onChange={e => { setReturnMethod(e.target.value); setProviderConfirmed(false); }} className={field}><option value="">Choose method</option><option value="Cash">Cash</option><option value="MobileMoney">Mobile money</option><option value="BankTransfer">Bank transfer</option></select></label><label className="block text-sm text-text">Receipt / provider refund reference (optional)<input maxLength={200} value={returnReference} onChange={e => setReturnReference(e.target.value)} className={field} /></label><label className="block text-sm text-text">Money returned at<input required type="datetime-local" step="1" value={returnedAt} onChange={e => setReturnedAt(e.target.value)} className={field} /></label>{returnMethod === 'Paystack' && <label className="flex min-h-11 items-center gap-3 text-sm text-text"><input required type="checkbox" checked={providerConfirmed} onChange={e => setProviderConfirmed(e.target.checked)} />Paystack confirms that this refund was successful.</label>}<label className="flex min-h-11 items-center gap-3 text-sm text-text"><input required type="checkbox" checked={moneyReturned} onChange={e => setMoneyReturned(e.target.checked)} />I confirm the guest has received this refund.</label></div>}<div className="flex flex-wrap gap-2">{data.nonRefundable && <label className="flex min-h-11 items-start gap-3 rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700"><input type="checkbox" checked={policyException} onChange={e => setPolicyException(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" /><span><strong className="block">This hotel is non-refundable.</strong>Tick to confirm this refund is an exception to the policy. It is saved with your name in the refund history.</span></label>}<button disabled={Boolean((data.nonRefundable && !policyException) || (preview && recordsReturn && (!moneyReturned || (returnMethod === 'Paystack' && !providerConfirmed))))} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Checking…' : preview ? 'Record refund' : 'Preview refund'}</button>{preview && <button type="button" onClick={() => setPreview(null)} className="min-h-11 rounded-lg border border-border px-4 text-sm text-text">Back to edit</button>}</div></fieldset></form> : <p className="text-sm text-text-muted">{data.payments.length > 0 && data.payments.every(p => p.online) ? 'Paid online, and online payments are non-refundable.' : data.totalRefundable > 0 ? 'Nothing left to refund from payments taken at the hotel (online payments are non-refundable), or it is covered by requests already made.' : 'No refundable balance. For an active stay, correct its charges first if a refund is due.'}</p>}
      {data.requests.length > 0 && <div className="space-y-3"><h4 className="font-semibold text-text">Refund requests</h4>{data.requests.map(request => <RequestCard key={`${request.requestId}-${request.status}`} request={{ ...request, reservation: { confirmationCode: reservation.confirmationCode } }} manager={user?.role === 'Manager'} />)}</div>}
      {data.refunds.length > 0 && <div className="space-y-3"><h4 className="font-semibold text-text">Refund history</h4>{data.refunds.map(refund => <div key={refund.refundId} className="space-y-1 rounded-lg border border-border p-3 text-sm text-text"><p className="font-bold">GHS {Number(refund.amount).toFixed(2)} · {refund.isSimulated ? 'Sent (simulation)' : 'Refund completed'}</p><p>Original payment #{refund.paymentId} · {refund.method}</p><p className="break-all">Reference: {refund.reference || 'Not provided'}</p><p className="text-text-muted">{refund.isSimulated ? 'Simulated at ' : 'Returned '}{new Date(refund.returnedAt).toLocaleString()} · Recorded by {refund.returnedByName}</p></div>)}</div>}
    </>}
  </section>;
}
