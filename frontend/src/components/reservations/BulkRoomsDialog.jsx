import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, LogIn, LogOut, Wallet, X } from 'lucide-react';
import { updateReservationRoomStatus } from '../../api/reservations';
import { OWING_REASONS } from './CheckoutOwingDialog';
import { roomStatusLabel } from '../../lib/statusLabels';

const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text';
const roomNo = (rr) => rr.room?.roomNumber || rr.roomNumberSnapshot || '—';
const day = (value) => String(value).slice(0, 10);
const localToday = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// Check in or check out several rooms of ONE booking together. Each room still goes through the
// normal per-room server action (occupant, cleaning and balance checks), one after another.
export default function BulkRoomsDialog({ mode, reservation, onDone, onClose, onTakePayment }) {
  const checkin = mode === 'checkin';
  const today = localToday();
  const stays = reservation.reservationRooms || [];
  const eligible = stays.filter((rr) => (checkin ? rr.status === 'Reserved' && day(rr.checkInDate) <= today : rr.status === 'CheckedIn' && day(rr.checkOutDate) <= today));
  const early = checkin ? [] : stays.filter((rr) => rr.status === 'CheckedIn' && day(rr.checkOutDate) > today);
  const inRoomCount = stays.filter((rr) => rr.status === 'CheckedIn').length;
  const guestName = reservation.guestNameSnapshot || reservation.platformGuest?.fullName || reservation.propertyGuest?.fullName || '';
  const balance = Math.max(0, Math.round((Number(reservation.totalAmount || 0) - Number(reservation.amountPaid || 0)) * 100) / 100);
  const code = reservation.confirmationCode || `#${reservation.reservationId.slice(0, 8)}`;

  const [rows, setRows] = useState(() => Object.fromEntries(eligible.map((rr, index) => [rr.reservationRoomId, {
    selected: true, name: rr.occupantName || (index === 0 ? guestName : ''), phone: rr.occupantPhone || '',
    uncleanOk: false, duplicate: null, duplicateOk: false, done: false, error: '',
    unclean: rr.room?.housekeepingStatus && !['Clean', 'Inspected'].includes(rr.room.housekeepingStatus) ? rr.room.housekeepingStatus : null,
  }])));
  const [reasonChoice, setReasonChoice] = useState('');
  const [otherText, setOtherText] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const patch = (id, change) => setRows((current) => ({ ...current, [id]: { ...current[id], ...change } }));

  const pending = eligible.filter((rr) => rows[rr.reservationRoomId]?.selected && !rows[rr.reservationRoomId]?.done);
  // Checking out every room still in the booking while money is owed is the final checkout: reason needed.
  const finalCheckout = !checkin && balance > 0.01 && pending.length > 0 && pending.length + stays.filter((rr) => rr.status === 'CheckedIn' && rows[rr.reservationRoomId]?.done).length >= inRoomCount && early.length === 0;
  const reason = reasonChoice === 'Other' ? (otherText.trim().length >= 5 ? `Other: ${otherText.trim()}` : '') : reasonChoice;
  const allDone = eligible.length > 0 && eligible.filter((rr) => rows[rr.reservationRoomId].selected).every((rr) => rows[rr.reservationRoomId].done);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    if (!pending.length) return setFormError('Tick at least one room.');
    if (checkin) {
      const missing = pending.find((rr) => !rows[rr.reservationRoomId].name.trim());
      if (missing) return setFormError(`Enter the occupant name for Room ${roomNo(missing)}.`);
      const badPhone = pending.find((rr) => rows[rr.reservationRoomId].phone && !/^0\d{9}$/.test(rows[rr.reservationRoomId].phone));
      if (badPhone) return setFormError(`Room ${roomNo(badPhone)}: phone must be 10 digits starting with 0, or leave it empty.`);
      const notConfirmed = pending.find((rr) => (rows[rr.reservationRoomId].unclean && !rows[rr.reservationRoomId].uncleanOk) || (rows[rr.reservationRoomId].duplicate && !rows[rr.reservationRoomId].duplicateOk));
      if (notConfirmed) return setFormError(`Room ${roomNo(notConfirmed)} needs your confirmation (tick the box on that room).`);
    } else if (finalCheckout && !reason) {
      return setFormError('These are the last rooms in the booking and money is still owed. Take payment first, or choose a reason.');
    }
    setBusy(true);
    let failures = 0;
    for (const [index, rr] of pending.entries()) {
      const row = rows[rr.reservationRoomId];
      const isLast = index === pending.length - 1;
      const data = checkin
        ? { status: 'CheckedIn', occupantName: row.name.trim(), occupantPhone: row.phone.trim(),
          ...(row.uncleanOk ? { uncleanRoomConfirmed: true } : {}), ...(row.duplicate && row.duplicateOk ? { duplicateOccupantConfirmation: row.duplicate.confirmation } : {}) }
        : { status: 'CheckedOut', ...(finalCheckout && isLast ? { overrideReason: reason } : {}) };
      try {
        await updateReservationRoomStatus(rr.reservationRoomId, data, { skipErrorToast: true });
        patch(rr.reservationRoomId, { done: true, error: '' });
      } catch (err) {
        failures += 1;
        const response = err.response?.data;
        if (response?.code === 'ROOM_NOT_CLEAN') patch(rr.reservationRoomId, { unclean: response.details?.housekeepingStatus || 'Dirty', uncleanOk: false, error: 'This room needs cleaning — tick to check in anyway.' });
        else if (response?.code === 'OCCUPANT_ALREADY_CHECKED_IN') patch(rr.reservationRoomId, { duplicate: response.details, duplicateOk: false, error: 'This person is already checked in to another room — tick to confirm.' });
        else patch(rr.reservationRoomId, { error: response?.message || 'Could not update this room.' });
        if (!checkin) break; // keep checkout order safe: stop at the first problem
      }
    }
    setBusy(false);
    onDone();
    if (failures) setFormError('Some rooms were not updated. Fix the highlighted rooms and press the button again.');
  };

  const title = checkin ? `Check in rooms · ${code}` : `Check out rooms · ${code}`;
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-rooms-title">
      <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id="bulk-rooms-title" className="flex items-center gap-2 text-lg font-bold text-text">{checkin ? <LogIn size={20} className="text-success-600" /> : <LogOut size={20} className="text-primary-600" />} {title}</h2>
            <p className="mt-1 text-xs text-text-muted">{guestName} · each ticked room is {checkin ? 'checked in' : 'checked out'} on its own. Other rooms are not changed.</p>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-secondary-100"><X size={20} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {!eligible.length && <p className="rounded-lg bg-secondary-50 p-3 text-sm text-text-muted">No rooms are ready to {checkin ? 'check in today' : 'check out today'}.</p>}
          {eligible.map((rr) => {
            const row = rows[rr.reservationRoomId];
            return (
              <div key={rr.reservationRoomId} className={`rounded-lg border p-3 ${row.done ? 'border-success-200 bg-success-50/60' : row.error ? 'border-danger-100 bg-danger-50/40' : 'border-border'}`}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={row.selected} disabled={busy || row.done} onChange={(e) => patch(rr.reservationRoomId, { selected: e.target.checked })} className="h-4 w-4 accent-primary-600" />
                  <span className="flex-1 font-semibold text-text">Room {roomNo(rr)} <span className="font-normal text-text-muted">· {rr.roomType?.typeName || rr.roomTypeNameSnapshot || ''}</span></span>
                  {row.done
                    ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-700"><CheckCircle2 size={16} /> {checkin ? 'Checked in' : 'Checked out'}</span>
                    : <span className="text-xs text-text-muted">{roomStatusLabel(rr.status)}</span>}
                </label>
                {checkin && row.selected && !row.done && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-text-muted">Occupant name <span className="text-danger-600">*</span>
                      <input value={row.name} maxLength={200} disabled={busy} onChange={(e) => patch(rr.reservationRoomId, { name: e.target.value, error: '' })} className={field} />
                    </label>
                    <label className="block text-xs font-semibold text-text-muted">Phone <span className="font-normal">(optional)</span>
                      <input value={row.phone} inputMode="numeric" maxLength={10} disabled={busy} onChange={(e) => patch(rr.reservationRoomId, { phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="0244123456" className={field} />
                    </label>
                  </div>
                )}
                {checkin && row.selected && !row.done && row.unclean && (
                  <label className="mt-2 flex items-start gap-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-700">
                    <input type="checkbox" checked={row.uncleanOk} disabled={busy} onChange={(e) => patch(rr.reservationRoomId, { uncleanOk: e.target.checked })} className="mt-0.5 h-4 w-4 accent-primary-600" />
                    <span><AlertTriangle size={14} className="mr-1 inline -mt-0.5" />Room {roomNo(rr)} needs cleaning. Check the guest in anyway.</span>
                  </label>
                )}
                {checkin && row.selected && !row.done && row.duplicate && (
                  <label className="mt-2 flex items-start gap-2 rounded-lg bg-warning-50 p-2 text-sm text-warning-700">
                    <input type="checkbox" checked={row.duplicateOk} disabled={busy} onChange={(e) => patch(rr.reservationRoomId, { duplicateOk: e.target.checked })} className="mt-0.5 h-4 w-4 accent-primary-600" />
                    <span>This person is already checked in to {(row.duplicate.conflicts || []).map((c) => `Room ${c.roomNumber}`).join(', ') || 'another room'}. Confirm it is the same person staying in this room too.</span>
                  </label>
                )}
                {row.error && !row.done && <p role="alert" className="mt-2 text-sm text-danger-700">{row.error}</p>}
              </div>
            );
          })}
          {early.length > 0 && (
            <p className="rounded-lg bg-secondary-50 p-3 text-sm text-text-muted">Not listed: Room {early.map(roomNo).join(', ')} {early.length === 1 ? 'is' : 'are'} booked beyond today. Use that room's own <strong>Check out</strong> to handle an early departure.</p>
          )}
          {!checkin && balance > 0.01 && (
            <div className="rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">
              <p><strong>Booking balance: GHS {balance.toFixed(2)}</strong> — this belongs to the whole booking {code}, not to one room.</p>
              {finalCheckout
                ? <p className="mt-1">These are the last rooms still checked in, so the guest leaves owing this amount.</p>
                : <p className="mt-1">Other rooms stay checked in, so the balance simply stays on the booking.</p>}
            </div>
          )}
          {finalCheckout && (
            <fieldset className="space-y-2">
              <button type="button" disabled={busy} onClick={onTakePayment} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"><Wallet size={16} /> Take payment first</button>
              <legend className="text-sm font-semibold text-text">Or check out with money owed <span className="text-danger-600">*</span></legend>
              {OWING_REASONS.map((option) => (
                <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm ${reasonChoice === option ? 'border-primary-400 bg-primary-50' : 'border-border'}`}>
                  <input type="radio" name="bulk-owing-reason" checked={reasonChoice === option} onChange={() => setReasonChoice(option)} className="h-4 w-4 accent-primary-600" />
                  {option === 'Other' ? 'Other (explain below)' : option}
                </label>
              ))}
              {reasonChoice === 'Other' && <textarea value={otherText} onChange={(e) => setOtherText(e.target.value)} maxLength={400} rows={2} placeholder="Explain why the guest is leaving without paying" className={field} />}
            </fieldset>
          )}
          {formError && <p role="alert" className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">{formError}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-border bg-surface p-4 sm:p-5">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text">{allDone ? 'Done' : 'Cancel'}</button>
          {!allDone && eligible.length > 0 && (
            <button type="submit" disabled={busy || !pending.length} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50 ${checkin ? 'bg-success-600 hover:bg-success-700' : 'bg-primary-600 hover:bg-primary-700'}`}>
              {busy && <Loader2 size={16} className="animate-spin" />} {checkin ? `Check in ${pending.length} room${pending.length === 1 ? '' : 's'}` : `Check out ${pending.length} room${pending.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
