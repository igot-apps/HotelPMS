import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import ReasonSelect from './ReasonSelect';
import CorrectionRequests, { CorrectionImpact } from './CorrectionRequests';
import { invalidateCorrections } from '../../lib/correction-actions';

export default function ReservationRecoveryPanel({ reservation, embedded = false }) {
  const userId = useAuthStore(state => state.user?.userId);
  const client = useQueryClient();
  const id = reservation.reservationId;
  const [form, setForm] = useState({ action: reservation.status === 'Cancelled' ? 'restore' : reservation.reservationRooms?.some(stay => stay.status === 'CheckedIn') ? 'undo-checkin' : reservation.reservationRooms?.some(stay => stay.status === 'CheckedOut') ? 'undo-checkout' : 'correct-date', stayId: '', targetRoomId: '', paymentId: '', newAmount: '', newCheckOutDate: '', reason: '' });
  const [preview, setPreview] = useState(null);
  const [stayIds, setStayIds] = useState([]);
  const multiRoom = ['undo-checkin', 'undo-checkout', 'correct-date', 'credit-checkout'].includes(form.action);
  const [pendingRequest, setPendingRequest] = useState(false);
  const access = useQuery({ queryKey: ['correctionAccess', userId], queryFn: async () => (await api.get('/reservations/correction-access')).data.data, refetchInterval: 15000 });
  const actionAccess = access.data?.find(item => item.action === form.action);
  const canApply = preview?.canApply ?? actionAccess?.canApply === true;
  const { data: history = [] } = useQuery({ queryKey: ['reservationCorrections', id], queryFn: async () => (await api.get(`/reservations/${id}/corrections`)).data.data });
  const { data: rooms = [] } = useQuery({ queryKey: ['transferRooms', id], enabled: form.action === 'transfer', queryFn: async () => (await api.get('/rooms', { params: { limit: 500 } })).data.data });
  const mutation = useMutation({
    mutationFn: async (apply) => {
      const request = apply && !canApply;
      return { ...(await api.post(`/reservations/${id}/${request ? 'correction-requests' : 'corrections'}`, { ...form, ...(multiRoom ? { stayIds } : {}), preview: !apply, expectedVersion: apply ? preview?.version : undefined })).data.data, requested: request };
    },
    onSuccess: (result, apply) => {
      if (!apply) { setPreview(result); return; }
      setPreview(null); setStayIds([]); setForm(current => ({ ...current, reason: '' }));
      invalidateCorrections(client);
      toast.success(result.requested ? 'Request sent. The reservation stays unchanged until a manager approves.' : 'Correction applied and recorded in history.');
    },
    onError: error => { setPreview(null); toast.error(error.response?.data?.message || 'Could not apply correction.'); },
  });
  const change = event => { setPreview(null); if (event.target.name === 'action') setStayIds([]); setForm(current => ({ ...current, ...(event.target.name === 'action' ? { reason: '', stayId: '' } : {}), [event.target.name]: event.target.value })); };
  const inputClass = 'mt-1 min-h-11 min-w-0 max-w-full w-full rounded-lg border border-border bg-background p-2 text-sm text-text';
  const stays = reservation.reservationRooms || [];
  const eligibleStays = stays.filter(stay => form.action === 'undo-checkout' ? stay.status === 'CheckedOut' : form.action === 'correct-date' ? ['Reserved', 'CheckedIn'].includes(stay.status) : stay.status === 'CheckedIn');
  return <section className={embedded ? "min-w-0 space-y-4" : "min-w-0 space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-6"}>
    {!embedded && <h3 className="text-lg font-bold text-text">Correct or undo actions</h3>}
    {access.isError && <p role="alert" className="text-sm text-danger-700">Could not load correction access. <button onClick={() => access.refetch()} className="min-h-11 underline">Try again</button></p>}
    <form onSubmit={event => { event.preventDefault(); if (multiRoom && (!stayIds.length || stayIds.some(id => !eligibleStays.some(stay => stay.reservationRoomId === id)))) { setPreview(null); toast.error('Select at least one eligible room.'); return; } mutation.mutate(Boolean(preview)); }} className="space-y-4">
      {pendingRequest && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You already have a request awaiting manager approval. To change it, withdraw the request below, then submit a new one.</p>}
      <fieldset disabled={mutation.isPending || !access.data || pendingRequest} className="min-w-0 space-y-4">
      <label className="block text-sm text-text">Action<select name="action" value={form.action} onChange={change} className={inputClass} disabled={mutation.isPending}>
        <option value="undo-checkout">Undo mistaken checkout</option>
        <option value="undo-checkin">Undo mistaken check-in</option>
        <option value="restore">Restore cancelled reservation</option>
        <option value="correct-date">Correct departure date and charges</option>
        <option value="transfer">Transfer guest to another room</option>
        <option value="correct-payment">Correct or void a manual payment</option>
        <option value="credit-checkout">Approve checkout with outstanding balance</option>
      </select></label>
      {access.data && !canApply && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Manager approval required. You can send a request after previewing it.</p>}
      {form.action === 'correct-date' && !preview && <p className="text-sm text-text-muted">Extending at the agreed rate can be applied directly. Shortening a stay or reducing charges may need manager approval; preview to check.</p>}
      {form.action === 'correct-payment' && <p className="text-sm text-text-muted">Your own manual payments recorded today can be corrected directly when both amounts are at most GHS 100. Voids and other corrections need approval.</p>}
      {form.action !== 'correct-payment' && actionAccess?.limit && <p className="text-sm text-text-muted">Your delegated limit: GHS {Number(actionAccess.limit).toFixed(2)}. {form.action === 'correct-date' ? 'Maximum charge reduction per correction.' : 'Maximum outstanding balance across the booking.'} Preview checks whether this correction qualifies.</p>}
      {preview?.delegationReason && <p role="status" className="text-sm text-text-muted">{preview.delegationReason}</p>}
      {multiRoom && <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-semibold text-text">Rooms to correct</legend><p className="text-sm text-text-muted">Select one or more rooms. The same action and reason apply to all selected rooms.</p>{eligibleStays.length > 0 ? <><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-text"><input type="checkbox" checked={eligibleStays.every(stay => stayIds.includes(stay.reservationRoomId))} onChange={e => { setPreview(null); setStayIds(e.target.checked ? eligibleStays.map(stay => stay.reservationRoomId) : []); }} />Select all eligible rooms ({eligibleStays.length})</label><div className="grid gap-2 sm:grid-cols-2">{eligibleStays.map(stay => <label key={stay.reservationRoomId} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm text-text ${stayIds.includes(stay.reservationRoomId) ? 'border-primary-400 bg-primary-50' : 'border-border bg-background'}`}><input type="checkbox" checked={stayIds.includes(stay.reservationRoomId)} onChange={e => { setPreview(null); setStayIds(current => e.target.checked ? [...current, stay.reservationRoomId] : current.filter(id => id !== stay.reservationRoomId)); }} /><span>Room {stay.room?.roomNumber || stay.roomNumberSnapshot || 'removed'}<span className="ml-2 text-text-muted">{stay.status === 'CheckedIn' ? 'Checked in' : stay.status === 'CheckedOut' ? 'Checked out' : stay.status}</span></span></label>)}</div><p aria-live="polite" className="text-sm text-text-muted">{stayIds.length} room(s) selected</p></> : <p className="text-sm text-text-muted">No rooms eligible for this action.</p>}</fieldset>}
      {form.action === 'transfer' && <label className="block text-sm text-text">Room to transfer<select required name="stayId" value={form.stayId} onChange={change} className={inputClass}><option value="">Select room stay</option>{eligibleStays.map(stay => <option key={stay.reservationRoomId} value={stay.reservationRoomId}>Room {stay.room?.roomNumber || stay.roomNumberSnapshot || 'removed'}</option>)}</select><span className="mt-1 block text-xs text-text-muted">Transfer one room at a time so each guest has a separate destination.</span></label>}
      {form.action === 'correct-date' && <label className="block text-sm text-text">Correct departure date<input required type="date" name="newCheckOutDate" value={form.newCheckOutDate} onChange={change} className={inputClass} /></label>}
      {form.action === 'transfer' && <label className="block text-sm text-text">New room<select required name="targetRoomId" value={form.targetRoomId} onChange={change} className={inputClass}><option value="">Select an available clean room</option>{rooms.filter(room => room.operationalStatus === 'Available' && ['Clean', 'Inspected'].includes(room.housekeepingStatus)).map(room => <option key={room.roomId} value={room.roomId}>{room.roomNumber} — {room.roomType?.typeName}</option>)}</select></label>}
      {form.action === 'correct-payment' && <><label className="block text-sm text-text">Original payment<select required name="paymentId" value={form.paymentId} onChange={change} className={inputClass}><option value="">Select completed manual payment</option>{(reservation.payments || []).filter(payment => payment.status === 'Completed' && !payment.gatewayReference?.startsWith('RES-')).map(payment => <option key={payment.paymentId} value={payment.paymentId}>#{payment.paymentId} — {payment.amount} GHS ({payment.paymentMethod})</option>)}</select></label><label className="block text-sm text-text">Correct amount (zero to void)<input required type="number" min="0" step="0.01" name="newAmount" value={form.newAmount} onChange={change} className={inputClass} /></label></>}
      <ReasonSelect key={form.action} action={form.action} value={form.reason} onChange={reason => { setPreview(null); setForm(current => ({ ...current, reason })); }} className={inputClass} disabled={mutation.isPending} />
      {preview && <CorrectionImpact preview={preview} />}
      <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Checking…' : preview ? canApply ? 'Confirm correction' : 'Send for manager approval' : 'Preview correction'}</button>{preview && <button type="button" onClick={() => setPreview(null)} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm">Back to edit</button>}</div>
      </fieldset>
    </form>
    <CorrectionRequests reservationId={id} onPendingChange={setPendingRequest} />
    {Number(reservation.refundDue) > 0 && reservation.status !== 'Cancelled' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">GHS {Number(reservation.refundDue).toFixed(2)} credit requires refund review. No refund has been sent automatically.</p>}
    <details><summary className="cursor-pointer font-semibold text-text">Correction history ({history.length})</summary><div className="mt-3 space-y-3">{history.length === 0 && <p className="text-sm text-text-muted">No recorded corrections yet.</p>}{history.map(item => <details key={item.auditLogId} className="rounded-lg border border-border p-3 text-sm text-text"><summary>{item.action} · {item.user?.fullName || (item.newData?.guestId ? 'Guest' : item.action === 'OnlinePaymentHoldExpired' ? 'System' : 'Former staff')} · {new Date(item.createdAt).toLocaleString()}</summary><p className="mt-2">{item.newData?.reason}</p><p className="mt-2 text-xs">Previous rooms: {(item.oldData?.value?.reservationRooms || []).map(room => room.roomNumberSnapshot || room.roomId).join(', ') || 'See original stay record'}</p><p className="mt-1 text-xs">Updated rooms: {(item.newData?.value?.reservation?.reservationRooms || []).map(room => room.roomNumberSnapshot || room.roomId).join(', ') || 'No room assignment change'}</p>{item.newData?.value?.result?.replacementPaymentId && <p className="mt-1 text-xs">Replacement payment #{item.newData.value.result.replacementPaymentId}</p>}</details>)}</div></details>
  </section>;
}
