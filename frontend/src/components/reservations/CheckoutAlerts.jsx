import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlarmClock, Loader2, ShieldAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';
import useCheckoutAlerts from '../../hooks/useCheckoutAlerts';
import { formatDuration, formatTime } from '../../lib/stayTiming';
import RecordDepartureDialog from './RecordDepartureDialog';
import { bookingLink } from '../../lib/bookingLink';

const STATE = {
  overdue: { label: 'Overdue', className: 'bg-danger-50 text-danger-700', rank: 2 },
  dueSoon: { label: 'Due soon', className: 'bg-warning-50 text-warning-800', rank: 1 },
  due: { label: 'Due today', className: 'bg-primary-50 text-primary-700', rank: 0 },
};
const RESULT = { present: 'Still in the room', departed: 'Has left', unlocated: 'Could not be found' };

// "Thu, 19 Nov 2026 · 11:00 AM" — the hotel's checkout moment (browser time = hotel time).
const fullCheckout = (value) => {
  const date = new Date(value);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const rest = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${day}, ${rest} · ${formatTime(date)}`;
};

// One reminder per reservation: its rooms share the booking and its total balance.
function groupByReservation(alerts) {
  return Object.values(alerts.reduce((byRes, alert) => {
    const id = alert.reservationId || alert.reservationRoomId;
    const current = byRes[id];
    if (!current) {
      byRes[id] = {
        reservationId: alert.reservationId,
        guestName: alert.guestName,
        confirmationCode: alert.confirmationCode,
        balanceDue: alert.balanceDue || 0,
        escalated: Boolean(alert.escalated),
        rooms: [alert],
      };
    } else {
      current.rooms.push(alert);
      current.escalated = current.escalated || Boolean(alert.escalated);
    }
    return byRes;
  }, {}));
}

const verificationLine = (verification) => (
  <p className="text-xs text-text-muted">Last check: {RESULT[verification.result]} · {new Date(verification.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{verification.by ? ` · ${verification.by}` : ''}{verification.note ? ` — ${verification.note}` : ''}</p>
);

// Persistent checkout reminders on the dashboard. Alerts stay until the room is checked out or extended.
export default function CheckoutAlerts() {
  const { data, isError } = useCheckoutAlerts();
  const [verifying, setVerifying] = useState(null);
  const [recording, setRecording] = useState(null);
  if (isError) return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Could not refresh checkout reminders.</p>;
  if (!data?.alerts?.length) return null;
  const isManager = data.role === 'Manager';
  const groups = groupByReservation(data.alerts);

  return (
    <section className="rounded-xl border border-warning-200 bg-surface p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-text"><AlarmClock size={18} className="text-warning-600" /> Checkout reminders</h2>
        <p className="text-xs text-text-muted">{data.counts.overdue} overdue · {data.counts.dueSoon} due soon · {data.counts.due} due today{isManager && data.counts.escalated ? ` · ${data.counts.escalated} need manager attention` : ''}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const worst = group.rooms.reduce((a, b) => ((STATE[b.state]?.rank ?? 0) > (STATE[a.state]?.rank ?? 0) ? b : a), group.rooms[0]);
          const state = STATE[worst.state] || STATE.due;
          const numbers = group.rooms.map((room) => room.roomNumber || '—').join(', ');
          const multi = group.rooms.length > 1;
          return (
            <li key={group.reservationId || group.rooms[0].reservationRoomId} className={`rounded-lg border p-3 ${group.escalated ? 'border-danger-300' : 'border-border'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-bold text-text">{multi ? `Rooms ${numbers}` : `Room ${numbers}`}</p>
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${state.className}`}>{state.label}</span>
              </div>
              <p className="text-sm text-text">{group.guestName}</p>
              {group.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{group.confirmationCode}</p>}
              {multi ? (
                <ul className="mt-1 space-y-1">
                  {group.rooms.map((room) => (
                    <li key={room.reservationRoomId}>
                      <p className="text-sm text-text-muted">Room {room.roomNumber || '—'} · {STATE[room.state]?.label || 'Due today'} · {fullCheckout(room.expectedCheckoutAt)}{room.state === 'overdue' ? ` · ${formatDuration(room.minutesLate * 60000)} late` : ''}</p>
                      {room.verification && verificationLine(room.verification)}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="text-sm text-text-muted">Checkout: {fullCheckout(group.rooms[0].expectedCheckoutAt)}</p>
                  {group.rooms[0].state === 'overdue' && <p className="text-sm font-semibold text-danger-700">{formatDuration(group.rooms[0].minutesLate * 60000)} late · guest departure needs confirmation</p>}
                  {group.rooms[0].verification && <p className="mt-1">{verificationLine(group.rooms[0].verification)}</p>}
                </>
              )}
              {group.escalated && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger-700"><ShieldAlert size={13} /> {isManager ? 'Needs manager attention' : 'Escalated to the manager'}</p>}
              {group.balanceDue > 0 && <p className="mt-1 text-xs font-semibold text-danger-700">Reservation balance: GHS {group.balanceDue.toFixed(2)}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`${bookingLink(group)}&back=dashboard`} className="min-h-10 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white">View reservation</Link>
                {group.rooms.map((room) => (
                  <button key={room.reservationRoomId} type="button" onClick={() => setVerifying(room)} className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text">{multi ? `Verify ${room.roomNumber || ''}`.trim() : 'Verify'}</button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {verifying && <VerifyDepartureDialog alert={verifying} onClose={() => setVerifying(null)} onRecordEarlier={() => { setRecording(verifying); setVerifying(null); }} />}
      {recording && <RecordDepartureDialog stay={recording} onClose={() => setRecording(null)} />}
    </section>
  );
}

function VerifyDepartureDialog({ alert, onClose, onRecordEarlier }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = `/reservations?search=${encodeURIComponent(alert.confirmationCode || alert.reservationId)}`;

  const save = async (event) => {
    event.preventDefault();
    if (busy || !result) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/reservations/rooms/${alert.reservationRoomId}/verify-departure`, { result, note }, { skipErrorToast: true });
      queryClient.invalidateQueries({ queryKey: ['checkoutAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Verification recorded.');
      if (result === 'departed') setSaved(result); else onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not record the verification.');
    } finally { setBusy(false); }
  };

  const option = (value, title, text) => (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${result === value ? 'border-primary-500 bg-primary-50/60' : 'border-border'}`}>
      <input type="radio" name="verify-result" className="mt-1 accent-primary-600" checked={result === value} disabled={busy} onChange={() => setResult(value)} />
      <span><span className="block font-semibold text-text">{title}</span><span className="text-text-muted">{text}</span></span>
    </label>
  );

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="verify-title">
      <form onSubmit={save} className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="verify-title" className="text-lg font-bold text-text">Verify Room {alert.roomNumber || '—'}</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        {saved ? (
          <div className="space-y-3 text-sm">
            <p className="text-text">Recorded that {alert.guestName} has left. Now close the stay:</p>
            <div className="flex flex-wrap gap-2">
              <Link to={`${bookingLink(alert)}&back=dashboard`} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white">View reservation</Link>
              <button type="button" onClick={onRecordEarlier} className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold text-text">They left earlier — record actual departure</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-muted">Is {alert.guestName} still here? This is recorded and the reminder stays until the room is checked out or extended.</p>
            <div className="space-y-2">
              {option('present', 'Guest is still in the room', 'Then extend the stay or check them out when they leave.')}
              {option('departed', 'Guest has left', 'Then check out now, or record an earlier departure.')}
              {option('unlocated', 'Guest cannot be found', 'The manager is alerted. Describe what was checked.')}
            </div>
            <label className="block text-sm font-medium text-text">Note{result === 'unlocated' ? '' : ' (optional)'}
              <textarea maxLength={300} rows={2} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Knocked twice, no answer; luggage still in room" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm text-text" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button>
              <button disabled={busy || !result || (result === 'unlocated' && note.trim().length < 5)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Save</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
