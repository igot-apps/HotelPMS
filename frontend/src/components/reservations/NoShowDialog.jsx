import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { getReservationById, markAsNoShow } from '../../api/reservations';
import { formatHotelTime, noShowAllowedFrom, noShowRooms } from '../../lib/stayTiming';
import { OWING_REASONS } from './CheckoutOwingDialog';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value) => new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const roomNumber = (stay) => stay.room?.roomNumber || stay.roomNumberSnapshot || '—';

// The eligibility rule lives with the other timing rules (testable without React).
export { noShowRooms };

// Mark exactly one room as no-show (opened from that room's own button). Only this room is released;
// other rooms, charges and payments stay as they are. Pass the booking, or just its id (dashboard),
// in which case the booking is loaded first so the checks below use its current state.
export default function NoShowDialog({ reservation, reservationId, stayId, onClose }) {
  const loaded = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: async () => (await getReservationById(reservationId)).data.data,
    enabled: !reservation && Boolean(reservationId),
  });
  const res = reservation || loaded.data;
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [owingChoice, setOwingChoice] = useState('');
  const [owingOther, setOwingOther] = useState('');
  const save = useMutation({
    mutationFn: async (body) => (await markAsNoShow(res.reservationId, body)).data,
    onSuccess: (data) => {
      for (const key of ['reservations', 'reservation', 'rooms', 'availability', 'calendarReservations', 'dashboardGlance', 'operationalOverview', 'reservationStats', 'owedAfterCheckout', 'reservationCorrections']) client.invalidateQueries({ queryKey: [key] });
      toast.success(data?.message || 'Marked as no-show.');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not mark the no-show.'),
  });

  const shell = (body, footer) => (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="no-show-title">
      <form onSubmit={(event) => { event.preventDefault(); footer?.submit?.(); }} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        {body}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm text-text">Cancel</button>
          {footer?.button}
        </div>
      </form>
    </div>
  );

  if (!res) {
    return shell(<div className="p-4 text-sm">{loaded.isError
      ? <p role="alert" className="text-danger-700">Could not load this reservation. Please try again.</p>
      : <p role="status" className="flex items-center gap-2 text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading the reservation…</p>}</div>);
  }

  const stay = (res.reservationRooms || []).find((room) => room.reservationRoomId === stayId);
  const eligible = Boolean(stay) && noShowRooms(res).some((room) => room.reservationRoomId === stayId);
  const label = stay ? `Room ${roomNumber(stay)}` : 'this room';
  const from = stay && noShowAllowedFrom(stay.checkInDate || res.checkInDate, res.property?.checkInTime, res.property?.timezone);
  const balance = Math.max(0, Number(res.totalAmount || 0) - Number(res.amountPaid || 0));
  // The booking's other rooms that still count (not cancelled, not already no-show).
  const others = (res.reservationRooms || []).filter((room) => room.reservationRoomId !== stayId && !['Cancelled', 'NoShow'].includes(room.status));
  const outcome = !others.length ? 'Nobody else from this booking is staying, so the whole reservation becomes No-show.'
    : others.every((room) => room.status === 'CheckedOut') ? 'The other guests have already left, so the booking is checked out.'
    : 'The reservation stays active for its other rooms.';
  // Everyone else has already left: this checks the booking out. If money is still owed, record why,
  // as at a normal checkout (shown under "Owed after checkout").
  const completesOwing = others.length > 0 && others.every((room) => room.status === 'CheckedOut') && balance > 0.009;
  const owingReason = owingChoice === 'Other' ? (owingOther.trim().length >= 5 ? `Other: ${owingOther.trim()}` : '') : owingChoice;
  const canSave = eligible && (!completesOwing || owingReason) && !save.isPending;
  const submit = () => { if (canSave) save.mutate({ reason: reason.trim(), stayIds: [stayId], ...(completesOwing ? { owingReason } : {}) }); };

  return shell(
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 id="no-show-title" className="flex items-center gap-2 text-lg font-bold text-text"><AlertCircle size={20} className="text-orange-600" /> Mark {label} as no-show</h2>
          <p className="text-sm text-text-muted">{res.confirmationCode} · {stay?.occupantName || res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Guest'}{stay?.occupantPhone || res.guestPhoneSnapshot ? ` · ${stay?.occupantPhone || res.guestPhoneSnapshot}` : ''}</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
      </div>
      <div className="space-y-3 overflow-y-auto p-4 text-sm">
        {!stay ? <p role="alert" className="text-danger-700">This room is no longer part of the reservation.</p>
          : !eligible ? (
            <p role="alert" className="rounded-lg border border-border bg-secondary-50 p-3 text-text">
              {stay.status !== 'Reserved' ? `${label} is not waiting for arrival, so it cannot be marked as a no-show.`
                : `The guest can still arrive. ${label} can be marked as a no-show from ${formatHotelTime(from, res.property?.timezone)}.`}
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-800">
                <p className="font-semibold">Releases {label} for {day(stay.checkInDate)} – {day(stay.checkOutDate)}. Other guests can then book it.</p>
                <p className="mt-1">Only {label} is affected. {outcome}</p>
              </div>
              <p className="text-text-muted">Charges and payments stay unchanged: paid {cash(res.amountPaid)}{balance > 0.009 ? `, balance ${cash(balance)} stays on the booking` : ''}. Nothing is refunded.</p>
              {completesOwing && (
                <fieldset className="space-y-2 rounded-lg border border-danger-200 bg-danger-50 p-3">
                  <legend className="px-1 font-semibold text-danger-700">This checks the booking out with {cash(balance)} still owed. Why?</legend>
                  {OWING_REASONS.map((option) => (
                    <label key={option} className="flex min-h-10 cursor-pointer items-center gap-2 text-text"><input type="radio" name="no-show-owing" className="h-5 w-5" checked={owingChoice === option} onChange={() => setOwingChoice(option)} /> {option}</label>
                  ))}
                  {owingChoice === 'Other' && <input value={owingOther} onChange={(event) => setOwingOther(event.target.value)} maxLength={250} placeholder="At least 5 characters" aria-label="Other reason" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text" />}
                </fieldset>
              )}
              <p className="text-xs text-text-muted">If the guest turns up later, open the reservation and use "Guest arrived" on the room.</p>
              <label className="block font-semibold text-text">Reason <span className="font-normal text-text-muted">(optional)</span>
                <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="e.g. Phone unreachable, no message from guest" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text" />
              </label>
            </>
          )}
      </div>
    </>,
    { submit, button: <button disabled={!canSave} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending && <Loader2 size={16} className="animate-spin" />} Mark {label} as no-show</button> },
  );
}
