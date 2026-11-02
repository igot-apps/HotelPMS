import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import ReasonSelect from './ReasonSelect';

export default function ReservationRecoveryPanel({ reservation }) {
  const manager = useAuthStore(state => state.user?.role === 'Manager');
  const client = useQueryClient();
  const id = reservation.reservationId;
  const [form, setForm] = useState({ action: 'undo-checkout', stayId: '', targetRoomId: '', paymentId: '', newAmount: '', newCheckOutDate: '', reason: '' });
  const [preview, setPreview] = useState(null);
  const { data: history = [] } = useQuery({ queryKey: ['reservationCorrections', id], queryFn: async () => (await api.get(`/reservations/${id}/corrections`)).data.data });
  const { data: rooms = [] } = useQuery({ queryKey: ['transferRooms', id], enabled: manager && form.action === 'transfer', queryFn: async () => (await api.get('/rooms', { params: { limit: 500 } })).data.data });
  const mutation = useMutation({
    mutationFn: async (apply) => (await api.post(`/reservations/${id}/corrections`, { ...form, preview: !apply, expectedVersion: apply ? preview?.version : undefined })).data.data,
    onSuccess: (result, apply) => {
      if (!apply) { setPreview(result); return; }
      setPreview(null); setForm(current => ({ ...current, reason: '' }));
      for (const key of ['reservation', 'reservationStats', 'reservationCorrections', 'reservations', 'rooms', 'availability', 'payments', 'calendarReservations', 'operationalOverview', 'transferRooms']) client.invalidateQueries({ queryKey: [key] });
      toast.success('Correction applied and recorded in history.');
    },
    onError: error => { setPreview(null); toast.error(error.response?.data?.message || 'Could not apply correction.'); },
  });
  const change = event => { setPreview(null); setForm(current => ({ ...current, ...(event.target.name === 'action' ? { reason: '', stayId: '' } : {}), [event.target.name]: event.target.value })); };
  const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm text-text';
  const stays = reservation.reservationRooms || [];
  return <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
    <h3 className="text-lg font-bold text-text">Correct or undo actions</h3>
    {manager && <form onSubmit={event => { event.preventDefault(); mutation.mutate(Boolean(preview)); }} className="space-y-4">
      <p className="text-sm text-text-muted">Preview a correction, check its impact, then confirm. A reason is required and the original details remain in history.</p>
      <label className="block text-sm text-text">Action<select name="action" value={form.action} onChange={change} className={inputClass} disabled={mutation.isPending}>
        <option value="undo-checkout">Undo mistaken checkout</option>
        <option value="undo-checkin">Undo mistaken check-in</option>
        <option value="restore">Restore cancelled reservation</option>
        <option value="correct-date">Correct departure / early departure / extension</option>
        <option value="transfer">Transfer guest to another room</option>
        <option value="correct-payment">Correct or void a manual payment</option>
        <option value="credit-checkout">Approve checkout with outstanding balance</option>
      </select></label>
      {!['restore', 'correct-payment'].includes(form.action) && <label className="block text-sm text-text">Room stay<select required name="stayId" value={form.stayId} onChange={change} className={inputClass}><option value="">Select room stay</option>{stays.map(stay => <option key={stay.reservationRoomId} value={stay.reservationRoomId}>Room {stay.room?.roomNumber || stay.roomNumberSnapshot || 'removed'} — {stay.status}</option>)}</select></label>}
      {form.action === 'correct-date' && <label className="block text-sm text-text">Correct departure date<input required type="date" name="newCheckOutDate" value={form.newCheckOutDate} onChange={change} className={inputClass} /></label>}
      {form.action === 'transfer' && <label className="block text-sm text-text">New room<select required name="targetRoomId" value={form.targetRoomId} onChange={change} className={inputClass}><option value="">Select an available clean room</option>{rooms.filter(room => room.operationalStatus === 'Available' && ['Clean', 'Inspected'].includes(room.housekeepingStatus)).map(room => <option key={room.roomId} value={room.roomId}>{room.roomNumber} — {room.roomType?.typeName}</option>)}</select></label>}
      {form.action === 'correct-payment' && <><label className="block text-sm text-text">Original payment<select required name="paymentId" value={form.paymentId} onChange={change} className={inputClass}><option value="">Select completed manual payment</option>{(reservation.payments || []).filter(payment => payment.status === 'Completed' && !payment.gatewayReference?.startsWith('RES-')).map(payment => <option key={payment.paymentId} value={payment.paymentId}>#{payment.paymentId} — {payment.amount} GHS ({payment.paymentMethod})</option>)}</select></label><label className="block text-sm text-text">Correct amount (zero to void)<input required type="number" min="0" step="0.01" name="newAmount" value={form.newAmount} onChange={change} className={inputClass} /></label></>}
      <ReasonSelect key={form.action} action={form.action} value={form.reason} onChange={reason => { setPreview(null); setForm(current => ({ ...current, reason })); }} className={inputClass} disabled={mutation.isPending} />
      {preview && <div role="status" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{preview.message}</p>{preview.newTotal !== undefined && <p>Total: GHS {preview.oldTotal.toFixed(2)} → {preview.newTotal.toFixed(2)}. Balance: GHS {preview.balanceDue.toFixed(2)}. Credit for review: GHS {preview.credit.toFixed(2)}.</p>}{preview.newAmount !== undefined && <p>Payment: GHS {preview.oldAmount.toFixed(2)} → {preview.newAmount.toFixed(2)}. Revised paid total: GHS {preview.newPaid.toFixed(2)}.</p>}</div>}
      <button disabled={mutation.isPending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Checking…' : preview ? 'Confirm correction' : 'Preview correction'}</button>
    </form>}
    {Number(reservation.refundDue) > 0 && reservation.status !== 'Cancelled' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">GHS {Number(reservation.refundDue).toFixed(2)} credit requires refund review. No refund has been sent automatically.</p>}
    <details><summary className="cursor-pointer font-semibold text-text">Correction history ({history.length})</summary><div className="mt-3 space-y-3">{history.length === 0 && <p className="text-sm text-text-muted">No recorded corrections yet.</p>}{history.map(item => <details key={item.auditLogId} className="rounded-lg border border-border p-3 text-sm text-text"><summary>{item.action} · {item.user?.fullName || 'Former staff'} · {new Date(item.createdAt).toLocaleString()}</summary><p className="mt-2">{item.newData?.reason}</p><p className="mt-2 text-xs">Previous rooms: {(item.oldData?.value?.reservationRooms || []).map(room => room.roomNumberSnapshot || room.roomId).join(', ') || 'See original stay record'}</p><p className="mt-1 text-xs">Updated rooms: {(item.newData?.value?.reservation?.reservationRooms || []).map(room => room.roomNumberSnapshot || room.roomId).join(', ') || 'No room assignment change'}</p>{item.newData?.value?.result?.replacementPaymentId && <p className="mt-1 text-xs">Replacement payment #{item.newData.value.result.replacementPaymentId}</p>}</details>)}</div></details>
  </section>;
}
