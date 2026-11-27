import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, Phone, X } from 'lucide-react';
import useCheckoutAlerts from '../../hooks/useCheckoutAlerts';
import { formatDuration, formatTime } from '../../lib/stayTiming';
import { bookingLink } from '../../lib/bookingLink';

const STATE = {
  overdue: { label: 'Overstayed', className: 'bg-danger-50 text-danger-700', rank: 2 },
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

const expectedCheckoutToday = (value) => `Guest is expected to check out today at ${formatTime(new Date(value))}`;

// One reminder per reservation: its rooms share the booking and its total balance.
function groupByReservation(alerts) {
  return Object.values(alerts.reduce((byRes, alert) => {
    const id = alert.reservationId || alert.reservationRoomId;
    const current = byRes[id];
    if (!current) {
      byRes[id] = {
        reservationId: alert.reservationId,
        guestName: alert.guestName,
        phone: alert.phone || null,
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
  if (isError) return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Could not refresh checkout reminders.</p>;
  if (!data?.alerts?.length) return null;
  const groups = groupByReservation(data.alerts);

  return (
    <section className="rounded-xl border border-warning-200 bg-surface p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-text"><AlarmClock size={18} className="text-warning-600" /> Checkout reminders</h2>
        <p className="text-xs text-text-muted">{data.counts.overdue} overdue · {data.counts.dueSoon} due soon · {data.counts.due} due today</p>
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
              {group.phone && <p className="flex items-center gap-1 text-sm text-text-muted"><Phone size={13} aria-hidden="true" /> {group.phone}</p>}
              {group.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{group.confirmationCode}</p>}
              {multi ? (
                <ul className="mt-1 space-y-1">
                  {group.rooms.map((room) => (
                    <li key={room.reservationRoomId}>
                      <p className="text-sm text-text-muted">Room {room.roomNumber || '—'} · {STATE[room.state]?.label || 'Due today'} · {room.state === 'due' ? expectedCheckoutToday(room.expectedCheckoutAt) : fullCheckout(room.expectedCheckoutAt)}{room.state === 'overdue' ? ` · ${formatDuration(room.minutesLate * 60000)} overstayed` : ''}</p>
                      {room.verification && verificationLine(room.verification)}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="text-sm text-text-muted">{worst.state === 'due' ? expectedCheckoutToday(worst.expectedCheckoutAt) : `Checkout: ${fullCheckout(worst.expectedCheckoutAt)}`}</p>
                  {group.rooms[0].state === 'overdue' && <p className="text-sm font-semibold text-danger-700">{formatDuration(group.rooms[0].minutesLate * 60000)} overstayed · Check whether the guest wants to extend or has left</p>}
                  {group.rooms[0].verification && <p className="mt-1">{verificationLine(group.rooms[0].verification)}</p>}
                </>
              )}
              <p className={`mt-1 text-xs font-semibold ${group.balanceDue > 0 ? 'text-danger-700' : 'text-success-700'}`}>{group.balanceDue > 0 ? `Owes: GHS ${group.balanceDue.toFixed(2)}` : 'Paid in full'}</p>
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
      {verifying && <VerifyDepartureDialog alert={verifying} onClose={() => setVerifying(null)} />}
    </section>
  );
}

// Past checkout time: call the guest if needed, then act. Each action is recorded by its own flow (Activity Log).
function VerifyDepartureDialog({ alert, onClose }) {
  const action = (to, title, text, primary = false) => (
    <Link to={to} onClick={onClose} className={`block rounded-lg border p-3 text-sm ${primary ? 'border-primary-500 bg-primary-50/60' : 'border-border'}`}>
      <span className="block font-semibold text-text">{title}</span><span className="text-text-muted">{text}</span>
    </Link>
  );
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="verify-title">
      <div className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="verify-title" className="text-lg font-bold text-text">Room {alert.roomNumber || '—'} · {alert.guestName}</h2>
            <p className="text-sm text-text-muted">Past checkout time. What should happen?</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        {alert.phone && <a href={`tel:${alert.phone.replace(/[^\d+]/g, '')}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-primary-700"><Phone size={16} aria-hidden="true" /> Call {alert.phone}</a>}
        <div className="space-y-2">
          {action(`${bookingLink(alert, 'extend')}&back=dashboard`, 'Extend stay', 'The guest is staying longer.', true)}
          {action(`${bookingLink(alert, 'checkout')}&back=dashboard`, 'Check out now', 'The guest has left or is leaving now. The room is freed.')}
        </div>
        <div className="flex justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button></div>
      </div>
    </div>
  );
}
