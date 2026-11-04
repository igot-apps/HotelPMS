import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const localPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('233') && digits.length === 12 ? `0${digits.slice(3)}` : digits;
};
const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text';
export default function RoomOccupantDialog({ room, reservation, mode, onSubmit, onClose, busy }) {
  const [name, setName] = useState(room.occupantName || '');
  const [phone, setPhone] = useState(localPhone(room.occupantPhone));
  const [useBookingGuest, setUseBookingGuest] = useState(false);
  const [warning, setWarning] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef(null);
  const nameInput = useRef(null);
  const warningPanel = useRef(null);
  const flight = useRef(false);
  const dismiss = useRef(null);
  dismiss.current = () => { if (!busy && !flight.current) onClose(); };
  useEffect(() => { if (warning) warningPanel.current?.focus(); }, [warning]);
  useEffect(() => {
    const previous = document.activeElement;
    nameInput.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss.current?.(); }
      if (event.key !== 'Tab') return;
      const items = [...(panel.current?.querySelectorAll('input:not(:disabled), button:not(:disabled)') || [])];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  const guestName = reservation.guestNameSnapshot || reservation.platformGuest?.fullName || reservation.propertyGuest?.fullName || '';
  const guestPhone = reservation.guestPhoneSnapshot || reservation.platformGuest?.phone || reservation.propertyGuest?.phone || '';
  const resetWarning = () => { setWarning(null); setConfirmed(false); setError(''); };
  const submit = async event => {
    event.preventDefault();
    if (busy || flight.current || (warning && !confirmed)) return;
    flight.current = true; setError('');
    try { await onSubmit({ occupantName: name.trim(), occupantPhone: phone.trim(), ...(warning && confirmed ? { duplicateOccupantConfirmation: warning.confirmation } : {}) }); }
    catch (err) {
      const response = err.response?.data;
      if (response?.code === 'OCCUPANT_ALREADY_CHECKED_IN') { setWarning(response.details); setConfirmed(false); }
      else setError(response?.message || 'Could not save occupant details. Your entries are still here; try again.');
    } finally { flight.current = false; }
  };
  const number = room.room?.roomNumber || room.roomNumberSnapshot || 'Removed';
  return <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="room-occupant-title" aria-describedby="room-occupant-description">
    <section ref={panel} className="max-h-[90dvh] w-full min-w-0 max-w-lg space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><h2 id="room-occupant-title" className="text-lg font-bold text-text">{mode === 'checkin' ? 'Check in' : 'Edit occupant'} · Room {number}</h2><button type="button" aria-label="Close occupant form" disabled={busy} onClick={() => dismiss.current()} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button></div>
      <p id="room-occupant-description" className="text-sm text-text-muted">Enter the main guest staying in this room.</p>
      <div className="rounded-lg border border-border bg-background p-3 text-sm"><p className="text-text-muted">Booking contact</p><p className="break-words font-semibold text-text">{guestName || 'Not provided'}</p></div>
      <form onSubmit={submit} className="space-y-4">
        {guestName && <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm text-text"><input type="checkbox" checked={useBookingGuest} disabled={busy} onChange={e => { resetWarning(); setUseBookingGuest(e.target.checked); setName(e.target.checked ? guestName : ''); setPhone(e.target.checked ? localPhone(guestPhone) : ''); }} />Booking guest is staying in this room</label>}
        <label className="block text-sm font-semibold text-text" htmlFor="room-occupant-name">Occupant full name<input ref={nameInput} id="room-occupant-name" required maxLength={200} autoComplete="off" value={name} disabled={busy} onChange={e => { setName(e.target.value); setUseBookingGuest(false); resetWarning(); }} className={inputClass} /></label>
        <label className="block text-sm font-semibold text-text" htmlFor="room-occupant-phone">Occupant phone (optional)<input id="room-occupant-phone" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} autoComplete="off" value={phone} disabled={busy} onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setUseBookingGuest(false); resetWarning(); }} className={inputClass} /></label>
        {phone && !/^\d{10}$/.test(phone) && <p className="text-sm text-danger-700">Enter exactly 10 digits.</p>}
        {warning && <div ref={warningPanel} tabIndex={-1} role="alert" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">This occupant is already checked in elsewhere.</p><ul className="list-inside list-disc break-words">{warning.conflicts.map((conflict, index) => <li key={index}>Room {conflict.roomNumber} · {conflict.confirmationCode}</li>)}</ul><p>Check the name and phone. If this is intentional, confirm below.</p><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />I confirm these occupant details are correct for this room.</label></div>}
        {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => dismiss.current()} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button><button disabled={busy || !name.trim() || (phone && !/^\d{10}$/.test(phone)) || (warning && !confirmed)} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : mode === 'checkin' ? warning ? 'Confirm occupant and check in' : 'Check in room' : warning ? 'Confirm and save occupant' : 'Save occupant'}</button></div>
      </form>
    </section>
  </div>;
}
