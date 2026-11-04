import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { invalidateCorrections } from '../../lib/correction-actions';
export default function RefundCompletionForm({ request, onCompleted, onBusyChange }) {
  const client = useQueryClient();
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [providerConfirmed, setProviderConfirmed] = useState(false);
  const [returnedAt, setReturnedAt] = useState(() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19); });
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: () => api.post(`/reservations/refund-requests/${request.requestId}/complete`, { method, reference, moneyReturned: confirmed, providerConfirmed, returnedAt: new Date(returnedAt).toISOString() }), onMutate: () => onBusyChange?.(true), onSuccess: () => { invalidateCorrections(client); toast.success('Money returned recorded. Original payment preserved.'); onCompleted?.(); }, onError: e => setError(e.response?.data?.message || 'Could not record the refund. Your entries are still here. Try again.'), onSettled: () => onBusyChange?.(false) });
  const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface p-2 text-sm text-text';
  return <form onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
    <h4 className="font-bold text-amber-900">Record GHS {Number(request.input.amount).toFixed(2)} returned</h4>
    <p className="text-sm text-amber-900">Return the money first. This form records the return; it does not send money or initiate a Paystack refund.</p>
    <label className="block text-sm text-text">Return method<select required disabled={mutation.isPending} value={method} onChange={e => { setMethod(e.target.value); setProviderConfirmed(false); }} className={field}><option value="">Choose method</option><option value="Cash">Cash</option><option value="MobileMoney">Mobile money</option><option value="BankTransfer">Bank transfer</option><option value="Paystack">Paystack refund processed externally</option></select></label>
    <label className="block text-sm text-text">Receipt / provider refund reference (optional)<input maxLength={200} disabled={mutation.isPending} value={reference} onChange={e => setReference(e.target.value)} className={field} /></label>
    <label className="block text-sm text-text">Money returned at<input required type="datetime-local" step="1" disabled={mutation.isPending} value={returnedAt} onChange={e => setReturnedAt(e.target.value)} className={field} /></label>
    {method === 'Paystack' && <label className="flex min-h-11 items-center gap-3 text-sm text-text"><input required type="checkbox" disabled={mutation.isPending} checked={providerConfirmed} onChange={e => setProviderConfirmed(e.target.checked)} />Paystack confirms that this refund was successful.</label>}
    <label className="flex min-h-11 items-center gap-3 text-sm text-text"><input required type="checkbox" disabled={mutation.isPending} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm the guest has received this refund.</label>
    {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
    <button disabled={mutation.isPending || !confirmed || (method === 'Paystack' && !providerConfirmed)} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Recording…' : 'Record money returned'}</button>
  </form>;
}

