import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, UserCheck, X } from 'lucide-react';
import api from '../../lib/axios';

const REASONS = ['Guest arrived late', 'Marked as no-show by mistake'];
const roomName = (stay) => `Room ${stay.room?.roomNumber || stay.roomNumberSnapshot || '—'}`;

// A room marked as no-show whose guest turns up (or that was marked by mistake): put it back as
// reserved, in the same room if still free, otherwise in a free room of the same type. Check-in is
// the normal next step; charges and payments are never changed here.
export default function GuestArrivedDialog({ reservation: res, stay, onClose }) {
  const client = useQueryClient();
  const [reason, setReason] = useState(REASONS[0]);
  const [targetRoomId, setTargetRoomId] = useState(null);
  const send = async (preview, extra = {}) => (await api.post(`/reservations/${res.reservationId}/corrections`, {
    action: 'restore', reason, stayIds: [stay.reservationRoomId], preview, ...extra,
  }, { skipErrorToast: true })).data.data;
  const check = useMutation({ mutationFn: () => send(true) });
  useEffect(() => { check.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = check.data;
  const save = useMutation({
    mutationFn: () => send(false, { expectedVersion: preview?.version, ...(targetRoomId ? { targetRoomId } : {}) }),
    onSuccess: () => {
      for (const key of ['reservations', 'reservation', 'rooms', 'availability', 'calendarReservations', 'dashboardGlance', 'reservationStats', 'owedAfterCheckout', 'reservationCorrections']) client.invalidateQueries({ queryKey: [key] });
      const moved = preview?.alternatives?.find((room) => room.roomId === targetRoomId);
      toast.success(`${moved ? `Room ${moved.roomNumber}` : roomName(stay)} is reserved for the guest again. Check them in when ready.`);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not restore this room.'),
  });
  const needsRoom = preview?.needsRoom;
  const blocked = check.isError || (needsRoom && !preview.alternatives?.length);
  const ready = preview && !blocked && (!needsRoom || targetRoomId);

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="guest-arrived-title">
      <form onSubmit={(event) => { event.preventDefault(); if (ready && !save.isPending) save.mutate(); }} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 id="guest-arrived-title" className="flex items-center gap-2 text-lg font-bold text-text"><UserCheck size={20} className="text-success-600" /> Guest arrived · {roomName(stay)}</h2>
            <p className="text-sm text-text-muted">{res.confirmationCode} · {stay.occupantName || res.guestNameSnapshot || 'Guest'}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 text-sm">
          <fieldset className="space-y-2">
            <legend className="font-semibold text-text">What happened?</legend>
            {REASONS.map((option) => (
              <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary-50">
                <input type="radio" name="arrived-reason" className="h-5 w-5" checked={reason === option} onChange={() => setReason(option)} /> {option}
              </label>
            ))}
          </fieldset>
          {check.isPending && <p role="status" className="flex items-center gap-2 text-text-muted"><Loader2 size={16} className="animate-spin" /> Checking the room…</p>}
          {check.isError && (
            <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-danger-700">
              <p>{check.error.response?.data?.message || 'Could not check this room.'}</p>
              {/ended|new reservation/i.test(check.error.response?.data?.message || '') && <Link to="/reservations?new=1" className="mt-2 inline-flex min-h-10 items-center font-semibold underline">Create a new reservation</Link>}
            </div>
          )}
          {preview && !needsRoom && <p className="rounded-lg border border-success-200 bg-success-50 p-3 text-success-800">{roomName(stay)} is still free. It goes back to <strong>Reserved</strong>; then check the guest in as usual.</p>}
          {needsRoom && (
            <div className="space-y-2">
              <p className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-warning-800">{preview.message}</p>
              {preview.alternatives?.map((room) => (
                <label key={room.roomId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary-50">
                  <input type="radio" name="arrived-room" className="h-5 w-5" checked={targetRoomId === room.roomId} onChange={() => setTargetRoomId(room.roomId)} />
                  <span className="font-semibold text-text">Room {room.roomNumber}</span>{room.needsCleaning && <span className="text-xs text-warning-700">needs cleaning before check-in</span>}
                </label>
              ))}
              {!preview.alternatives?.length && <Link to="/reservations?new=1" className="inline-flex min-h-10 items-center font-semibold text-primary-700 underline">Create a new reservation</Link>}
            </div>
          )}
          <p className="text-xs text-text-muted">Charges, payments and the booking's other rooms stay as they are. The no-show stays in the booking history.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm text-text">Cancel</button>
          <button disabled={!ready || save.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-success-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending && <Loader2 size={16} className="animate-spin" />} Restore room</button>
        </div>
      </form>
    </div>
  );
}
