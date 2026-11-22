import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BedDouble, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import { invalidateCorrections } from '../../lib/correction-actions';
import { addDays, defaultToday } from '../../lib/period';
import ReasonSelect from './ReasonSelect';

const dateLabel = (value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function MoveRoomDialog({ room, reservation, onClose }) {
  const client = useQueryClient();
  const [targetRoomId, setTargetRoomId] = useState('');
  const [reason, setReason] = useState('');
  const [uncleanConfirmed, setUncleanConfirmed] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const from = defaultToday(reservation.property?.timezone);
  const to = String(room.checkOutDate).slice(0, 10);
  const currentNumber = room.room?.roomNumber || room.roomNumberSnapshot || 'current room';

  const roomsQuery = useQuery({
    queryKey: ['transferRooms', reservation.reservationId],
    queryFn: async () => (await api.get('/rooms', { params: { limit: 500 } })).data.data,
  });
  const availabilityQuery = useQuery({
    queryKey: ['transferFreeRooms', reservation.reservationId, room.reservationRoomId, from, to],
    enabled: Boolean(from && to),
    queryFn: async () => new Set(((await api.get('/rooms/available', { params: { checkInDate: from, checkOutDate: to > from ? to : addDays(from, 1), propertyId: reservation.propertyId } })).data.data || []).map(item => item.roomId)),
    retry: false,
  });
  const available = (roomsQuery.data || []).filter(item =>
    item.roomId !== room.roomId && item.operationalStatus === 'Available' && (!availabilityQuery.data || availabilityQuery.data.has(item.roomId))
  );
  const roomTypeName = room.roomType?.typeName || room.room?.roomType?.typeName || room.roomTypeNameSnapshot || 'same type';
  const sameTypeAvailable = available.filter(item => item.roomTypeId === room.roomTypeId);
  const target = available.find(item => String(item.roomId) === targetRoomId);
  const targetNeedsCleaning = target && !['Clean', 'Inspected'].includes(target.housekeepingStatus);
  const correction = { action: 'transfer', stayId: room.reservationRoomId, targetRoomId: Number(targetRoomId), reason, uncleanRoomConfirmed: targetNeedsCleaning ? uncleanConfirmed : undefined };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (!preview) {
        setPreview((await api.post(`/reservations/${reservation.reservationId}/corrections`, { ...correction, preview: true }, { skipErrorToast: true })).data.data);
      } else {
        await api.post(`/reservations/${reservation.reservationId}/corrections`, { ...correction, expectedVersion: preview.version }, { skipErrorToast: true });
        invalidateCorrections(client);
        toast.success(`Guest moved to Room ${target?.roomNumber}.`);
        onClose();
      }
    } catch (err) {
      setPreview(null);
      setError(err.response?.data?.message || 'Could not move the guest. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="move-room-title">
      <section className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="move-room-title" className="flex items-center gap-2 text-lg font-bold text-text"><BedDouble size={20} className="text-primary-600" /> Move Room {currentNumber}</h2>
            <p className="mt-1 text-sm text-text-muted">{room.occupantName || reservation.guestNameSnapshot || 'Guest'} · until {dateLabel(room.checkOutDate)}</p>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text disabled:opacity-50"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-secondary-50 p-3 text-sm">
          <span><span className="block text-xs text-text-muted">Current room</span><strong>Room {currentNumber}</strong></span>
          <ArrowRight size={18} className="text-text-muted" />
          <span><span className="block text-xs text-text-muted">New room</span><strong>{target ? `Room ${target.roomNumber}` : 'Not selected'}</strong></span>
        </div>

        <label className="block text-sm font-semibold text-text">Choose an available clean room
          <select value={targetRoomId} disabled={busy || roomsQuery.isLoading || availabilityQuery.isLoading} onChange={(event) => { setTargetRoomId(event.target.value); setUncleanConfirmed(false); setPreview(null); setError(''); }} className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background p-2 text-sm">
            <option value="">Select new room</option>
            {available.map(item => <option key={item.roomId} value={item.roomId}>Room {item.roomNumber} — {item.roomType?.typeName}{!['Clean', 'Inspected'].includes(item.housekeepingStatus) ? ' · needs cleaning' : ''}</option>)}
          </select>
        </label>
        {!roomsQuery.isLoading && !availabilityQuery.isLoading && sameTypeAvailable.length === 0 && available.length > 0 && <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning-800">No {roomTypeName} room is available for the rest of this stay. The list contains available rooms of other types; the guest's agreed price will stay the same.</p>}
        {!roomsQuery.isLoading && !availabilityQuery.isLoading && available.length === 0 && <p className="rounded-lg bg-warning-50 p-3 text-sm text-warning-800">No {roomTypeName} room is available for the rest of this stay. No suitable room of another type is currently available either.</p>}
        {targetNeedsCleaning && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Room {target.roomNumber} needs cleaning</p><p className="mt-1">Only continue after checking that the room is actually ready. Your name will be recorded as the person who marked it clean.</p><label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 font-medium"><input type="checkbox" checked={uncleanConfirmed} disabled={busy} onChange={(event) => { setUncleanConfirmed(event.target.checked); setPreview(null); }} />I checked the room; mark it clean and continue</label></div>}

        <ReasonSelect action="transfer" value={reason} onChange={(value) => { setReason(value); setPreview(null); }} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2 text-sm" />

        <p className="rounded-lg bg-primary-50 p-3 text-sm text-primary-800">The agreed nightly price and departure date stay the same. The old room will become available and marked as needing cleaning.</p>
        {preview && <p className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-800">Ready to move the guest from Room {currentNumber} to Room {target?.roomNumber}. This change will be recorded in correction history.</p>}
        {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || !targetRoomId || reason.trim().length < 5 || (targetNeedsCleaning && !uncleanConfirmed)} onClick={submit} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}{preview ? 'Move guest' : 'Review move'}</button>
        </div>
      </section>
    </div>
  );
}
