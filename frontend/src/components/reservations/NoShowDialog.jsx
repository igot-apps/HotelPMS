import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { markAsNoShow } from '../../api/reservations';
import { formatHotelTime, noShowAllowedFrom } from '../../lib/stayTiming';
import { OWING_REASONS } from './CheckoutOwingDialog';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value) => new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const roomName = (stay) => `Room ${stay.room?.roomNumber || stay.roomNumberSnapshot || '—'}`;

// Rooms of a booking that can be marked as no-show now: still reserved and past the no-show time
// (hotel check-in time + 6 hours on the arrival day, hotel time zone). Same rule as the server.
export function noShowRooms(res, now = Date.now()) {
  if (!['Confirmed', 'InHouse'].includes(res?.status)) return [];
  return (res.reservationRooms || []).filter((stay) => stay.status === 'Reserved'
    && now >= noShowAllowedFrom(stay.checkInDate || res.checkInDate, res.property?.checkInTime, res.property?.timezone).getTime());
}

// True when at least one room already stayed, so the no-show can only cover the rooms still waiting.
export function noShowPartial(res) {
  return (res.reservationRooms || []).filter((stay) => stay.status !== 'Cancelled')
    .some((stay) => stay.actualCheckIn || ['CheckedIn', 'CheckedOut'].includes(stay.status));
}

// One dialog for every no-show: pick the rooms whose guests did not arrive. Only those rooms are
// released; other rooms, charges and payments stay as they are. Nothing is released automatically.
export default function NoShowDialog({ reservation: res, onClose }) {
  const client = useQueryClient();
  const rooms = (res.reservationRooms || []).filter((stay) => stay.status !== 'Cancelled');
  const eligible = noShowRooms(res);
  const someoneStayed = noShowPartial(res);
  const [selected, setSelected] = useState(() => eligible.map((stay) => stay.reservationRoomId));
  const [reason, setReason] = useState('');
  const [owingChoice, setOwingChoice] = useState('');
  const [owingOther, setOwingOther] = useState('');
  const waiting = rooms.filter((stay) => stay.status === 'Reserved');
  // Whole booking: nobody stayed and every room still waiting is selected.
  const wholeBooking = !someoneStayed && selected.length > 0 && waiting.every((stay) => selected.includes(stay.reservationRoomId));
  const chosen = rooms.filter((stay) => selected.includes(stay.reservationRoomId));
  const balance = Math.max(0, Number(res.totalAmount || 0) - Number(res.amountPaid || 0));
  // Everyone else has already left: marking these rooms checks the booking out. If money is still owed,
  // record why, as at a normal checkout (shown under "Owed after checkout").
  const others = rooms.filter((stay) => stay.status !== 'NoShow' && !selected.includes(stay.reservationRoomId));
  const completesOwing = selected.length > 0 && others.length > 0 && others.every((stay) => stay.status === 'CheckedOut') && balance > 0.009;
  const owingReason = owingChoice === 'Other' ? (owingOther.trim().length >= 5 ? `Other: ${owingOther.trim()}` : '') : owingChoice;
  const canSave = selected.length > 0 && (!completesOwing || owingReason);
  const save = useMutation({
    mutationFn: async () => (await markAsNoShow(res.reservationId, { reason: reason.trim(), ...(wholeBooking ? {} : { stayIds: selected }), ...(completesOwing ? { owingReason } : {}) })).data,
    onSuccess: (data) => {
      for (const key of ['reservations', 'reservation', 'rooms', 'availability', 'calendarReservations', 'dashboardGlance', 'operationalOverview', 'reservationStats', 'owedAfterCheckout', 'reservationCorrections']) client.invalidateQueries({ queryKey: [key] });
      toast.success(data?.message || 'Marked as no-show.');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not mark the no-show.'),
  });
  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="no-show-title">
      <form onSubmit={(event) => { event.preventDefault(); if (canSave && !save.isPending) save.mutate(); }} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 id="no-show-title" className="flex items-center gap-2 text-lg font-bold text-text"><AlertCircle size={20} className="text-orange-600" /> Mark no-show</h2>
            <p className="text-sm text-text-muted">{res.confirmationCode} · {res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Guest'}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 text-sm">
          <p className="text-text-muted">Select the rooms whose guests did not arrive. Only these rooms are released; other rooms, charges and payments stay as they are.</p>
          <ul className="space-y-2">
            {rooms.map((stay) => {
              const can = eligible.some((e) => e.reservationRoomId === stay.reservationRoomId);
              const from = noShowAllowedFrom(stay.checkInDate || res.checkInDate, res.property?.checkInTime, res.property?.timezone);
              const note = stay.status === 'CheckedIn' ? 'Checked in — not affected' : stay.status === 'CheckedOut' ? 'Stayed — not affected' : stay.status === 'NoShow' ? 'Already a no-show'
                : can ? `Arrival ${day(stay.checkInDate || res.checkInDate)} · not arrived` : `Guest can still arrive · no-show from ${formatHotelTime(from, res.property?.timezone)}`;
              return (
                <li key={stay.reservationRoomId}>
                  <label className={`flex min-h-12 items-center gap-3 rounded-lg border p-3 ${can ? 'cursor-pointer border-border hover:bg-secondary-50' : 'border-border bg-background opacity-70'}`}>
                    <input type="checkbox" className="h-5 w-5" disabled={!can || save.isPending} checked={can && selected.includes(stay.reservationRoomId)} onChange={() => toggle(stay.reservationRoomId)} />
                    <span className="min-w-0"><span className="block font-semibold text-text">{roomName(stay)}{stay.occupantName ? ` · ${stay.occupantName}` : ''}</span><span className="block text-xs text-text-muted">{note}</span></span>
                  </label>
                </li>
              );
            })}
          </ul>
          {chosen.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-800">
              <p className="font-semibold">Releases {chosen.map(roomName).join(', ')} for {chosen.length === 1 ? `${day(chosen[0].checkInDate)} – ${day(chosen[0].checkOutDate)}` : 'their booked dates'}. Other guests can then book {chosen.length === 1 ? 'it' : 'them'}.</p>
              <p className="mt-1">{wholeBooking ? 'Nobody from this booking arrived, so the whole reservation becomes No-show.' : 'The reservation stays active for its other rooms.'}</p>
            </div>
          )}
          <p className="text-text-muted">Paid {cash(res.amountPaid)}{balance > 0.009 ? ` · balance ${cash(balance)} stays on the booking` : ''}. Payments are kept; nothing is refunded.</p>
          {completesOwing && (
            <fieldset className="space-y-2 rounded-lg border border-danger-200 bg-danger-50 p-3">
              <legend className="px-1 font-semibold text-danger-700">The other guests have left, so this checks the booking out with {cash(balance)} still owed. Why?</legend>
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
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm text-text">Cancel</button>
          <button disabled={!canSave || save.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending && <Loader2 size={16} className="animate-spin" />} Mark {selected.length} room{selected.length === 1 ? '' : 's'} as no-show</button>
        </div>
      </form>
    </div>
  );
}
