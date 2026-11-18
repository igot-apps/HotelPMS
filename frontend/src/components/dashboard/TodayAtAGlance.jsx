import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlarmClock, AlertTriangle, BedDouble, ChevronRight, Coins, Hotel, Loader2, LogIn, LogOut, Sparkles, Wallet, X } from 'lucide-react';
import api from '../../lib/axios';
import useCheckoutAlerts from '../../hooks/useCheckoutAlerts';
import { formatDuration, formatTime } from '../../lib/stayTiming';
import { bookingLink } from '../../lib/bookingLink';
import { useAuthStore } from '../../store/authStore';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = (value) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const reservationLink = (row, action) => bookingLink(row, action);
const RESULT = { present: 'still in the room', departed: 'has left', unlocated: 'could not be found' };

// The front desk's key questions for today. Each tile answers one question; click it for the details.
export default function TodayAtAGlance() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardGlance'],
    queryFn: async () => (await api.get('/dashboard/glance', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const alerts = useCheckoutAlerts();
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (isLoading) return <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface p-6 text-sm text-text-muted"><Loader2 size={18} className="animate-spin" /> Loading today at a glance…</p>;
  if (isError || !data) return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Could not load today's figures. They refresh every minute.</p>;

  const overdue = (alerts.data?.alerts || []).filter((alert) => alert.state === 'overdue');
  // One no-show decision per booking, even if it holds several rooms.
  const missed = Object.values((data.arrivals.missed || []).reduce((byBooking, stay) => {
    const current = byBooking[stay.reservationId];
    byBooking[stay.reservationId] = current ? { ...current, rooms: [...current.rooms, stay.roomNumber] } : { ...stay, rooms: [stay.roomNumber] };
    return byBooking;
  }, {}));
  const attention = data.rooms.needsCleaning.length + data.rooms.maintenance.length + data.approvalsPending;
  const tiles = [
    { key: 'overdue', icon: AlarmClock, tone: overdue.length ? 'danger' : 'neutral', label: 'Overdue checkouts', value: overdue.length, hint: overdue.length ? `Longest: ${formatDuration(Math.max(...overdue.map((a) => a.minutesLate)) * 60000)} late` : `Checkout time ${data.checkOutTime}` },
    { key: 'arrivals', icon: LogIn, tone: missed.length ? 'warning' : 'primary', label: 'Arrivals to check in', value: data.arrivals.waiting.length, hint: [`${data.arrivals.arrivedToday.length} arrived today`, data.arrivals.unpaidCount ? `${data.arrivals.unpaidCount} unpaid` : '', missed.length ? `${missed.length} missed (no-show?)` : ''].filter(Boolean).join(' · ') },
    { key: 'departures', icon: LogOut, tone: 'warning', label: 'Departures to check out', value: data.departures.waiting.length, hint: `${data.departures.departedToday.length} checked out today` },
    { key: 'inHouse', icon: Hotel, tone: 'primary', label: 'Guests in house', value: data.inHouse.length, hint: `${data.rooms.occupiedTonight} of ${data.rooms.total} rooms taken tonight` },
    { key: 'free', icon: BedDouble, tone: 'success', label: 'Rooms free tonight', value: data.rooms.freeTonight.length, hint: `${data.rooms.occupancyPercent}% occupancy` },
    { key: 'collected', icon: Coins, tone: 'success', label: 'Collected today', value: cash(data.money.collectedToday), hint: `${data.money.payments.length} payment${data.money.payments.length === 1 ? '' : 's'}` },
    { key: 'unpaid', icon: Wallet, tone: data.money.unpaidInHouse.length ? 'warning' : 'neutral', label: 'Owed by guests in house', value: cash(data.money.inHouseOutstanding), hint: `${data.money.unpaidInHouse.length} booking${data.money.unpaidInHouse.length === 1 ? '' : 's'}${data.money.refundsPending ? ` · ${data.money.refundsPending} refund${data.money.refundsPending === 1 ? '' : 's'} pending` : ''}` },
    { key: 'attention', icon: Sparkles, tone: attention ? 'warning' : 'neutral', label: 'Needs attention', value: attention, hint: `${data.rooms.needsCleaning.length} to clean · ${data.rooms.maintenance.length} maintenance${data.approvalsPending ? ` · ${data.approvalsPending} approvals` : ''}` },
  ];

  return (
    <section aria-labelledby="glance-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="glance-title" className="text-lg font-bold text-text">Today at a glance</h2>
        <p className="text-xs text-text-muted">Click any figure for details · updated {clock(data.generatedAt)}</p>
      </div>
      <AvailabilityBanners data={data} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => <Tile key={tile.key} {...tile} onClick={() => setOpen(tile.key)} />)}
      </div>
      {open && (
        <Drawer title={tiles.find((tile) => tile.key === open).label} onClose={() => setOpen(null)}>
          {open === 'overdue' && <OverdueDetail rows={overdue} />}
          {open === 'arrivals' && <ArrivalsDetail data={data} missed={missed} />}
          {open === 'departures' && <DeparturesDetail data={data} />}
          {open === 'inHouse' && <InHouseDetail rows={data.inHouse} />}
          {open === 'free' && <FreeDetail rooms={data.rooms.freeTonight} />}
          {open === 'collected' && <CollectedDetail money={data.money} />}
          {open === 'unpaid' && <UnpaidDetail money={data.money} />}
          {open === 'attention' && <AttentionDetail data={data} />}
        </Drawer>
      )}
    </section>
  );
}

const BLOCKERS = {
  deactivated: { text: 'This hotel has been deactivated by HideOut24, so guests cannot book online.', staffText: ' Please tell your manager.', managerText: ' Contact HideOut24 support to reactivate it.' },
  'subscription-expired': { text: 'The subscription has ended, so new online bookings are paused.', fix: 'Renew subscription', to: '/billing' },
  'online-off': { text: 'Online booking is switched off for this hotel.', fix: 'Turn it on in Properties', to: '/properties' },
  'no-rooms': { text: 'No rooms have been set up yet, so the hotel is hidden from online booking.', fix: 'Add rooms', to: '/room-management' },
  'all-maintenance': { text: 'Every room is under maintenance, so nothing can be booked online.', fix: 'Review rooms', to: '/rooms' },
  'all-hidden': { text: 'Every room is hidden from online booking.', fix: 'Show rooms on the website', to: '/rooms' },
};

// "Fully booked" is good news (no space tonight); "can't book online" is a setup problem to fix.
function AvailabilityBanners({ data }) {
  const isManager = useAuthStore((state) => state.user?.role) === 'Manager';
  const blocker = BLOCKERS[data.onlineBlocker];
  return (
    <>
      {data.rooms.fullyBookedTonight && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-success-200 bg-success-50 p-4 text-success-800">
          <BedDouble size={20} className="shrink-0" />
          <p className="min-w-0 flex-1 text-sm"><strong>Fully booked tonight.</strong> All {data.rooms.total} rooms are occupied or reserved, so walk-ins can't be placed tonight.</p>
          <Link to="/availability" className="text-sm font-semibold underline">See other dates</Link>
        </div>
      )}
      {blocker && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-warning-800">
          <AlertTriangle size={20} className="shrink-0" />
          <p className="min-w-0 flex-1 text-sm"><strong>Guests can't book online.</strong> {blocker.text}{isManager ? (blocker.managerText || '') : (blocker.staffText || ' Please tell your manager.')}</p>
          {isManager && blocker.to && <Link to={blocker.to} className="rounded-lg bg-warning-600 px-3 py-2 text-sm font-semibold text-white">{blocker.fix}</Link>}
        </div>
      )}
    </>
  );
}

const TONES = {
  danger: 'border-danger-200 bg-danger-50/60 text-danger-700',
  warning: 'border-warning-200 bg-warning-50/50 text-warning-700',
  success: 'border-success-200 bg-success-50/50 text-success-700',
  primary: 'border-primary-100 bg-primary-50/50 text-primary-700',
  neutral: 'border-border bg-surface text-text-muted',
};

function Tile({ icon: Icon, tone, label, value, hint, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`group flex min-h-28 flex-col justify-between rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-500 ${TONES[tone]}`}>
      <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><Icon size={17} />{label}</span><ChevronRight size={16} className="opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
      <span className="mt-2 block break-words text-2xl font-bold text-text">{value}</span>
      <span className="mt-1 block text-xs text-text-muted">{hint}</span>
    </button>
  );
}

function Drawer({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

function Group({ title, empty, children, count }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">{title}{count !== undefined ? ` (${count})` : ''}</h3>
      {count === 0 ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </div>
  );
}

function Row({ to, title, lines = [], badge, badgeTone = 'neutral' }) {
  return (
    <li>
      <Link to={to} className="block rounded-lg border border-border p-3 transition hover:border-primary-300 hover:bg-primary-50/30">
        <span className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{title}</span>{badge && <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${TONES[badgeTone]}`}>{badge}</span>}</span>
        {lines.filter(Boolean).map((line) => <span key={line} className="mt-0.5 block text-sm text-text-muted">{line}</span>)}
      </Link>
    </li>
  );
}

function OverdueDetail({ rows }) {
  return (
    <Group title="Guests past checkout time" count={rows.length} empty="No checkouts are overdue.">
      {rows.map((alert) => (
        <Row key={alert.reservationRoomId} to={reservationLink(alert, 'checkout')}
          title={`Room ${alert.roomNumber || '—'} · ${alert.guestName}`} badge={`${formatDuration(alert.minutesLate * 60000)} late`} badgeTone="danger"
          lines={[
            `Expected out ${formatTime(new Date(alert.expectedCheckoutAt))} on ${new Date(alert.expectedCheckoutAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
            alert.verification ? `Last check: guest ${RESULT[alert.verification.result]} · ${clock(alert.verification.at)}${alert.verification.by ? ` by ${alert.verification.by}` : ''}` : 'Not verified yet — use Verify in Checkout reminders',
            alert.balanceDue > 0 ? `Balance owed: ${cash(alert.balanceDue)}` : 'Paid in full',
            alert.escalated ? 'Escalated to the manager' : '',
          ]} />
      ))}
    </Group>
  );
}

function ArrivalsDetail({ data, missed }) {
  const [noShow, setNoShow] = useState(null);
  return (
    <>
      {missed.length > 0 && (
        <Group title="Missed arrival — guest didn't come" count={missed.length}>
          {missed.map((stay) => (
            <li key={stay.reservationId} className="rounded-lg border border-warning-200 bg-warning-50/40 p-3">
              <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{stay.guestName}</span><span className="shrink-0 rounded-md bg-warning-100 px-2 py-0.5 text-xs font-bold text-warning-800">{stay.daysMissed ? `${stay.daysMissed} day${stay.daysMissed === 1 ? '' : 's'} missed` : 'Not arrived'}</span></p>
              <p className="mt-0.5 text-sm text-text-muted">Room {stay.rooms.filter(Boolean).join(', ') || 'unassigned'} · arrival {shortDate(stay.checkInDate)} · {stay.nightsLeft} night{stay.nightsLeft === 1 ? '' : 's'} still held</p>
              <p className="text-sm text-text-muted">{stay.amountPaid > 0 ? `Paid ${cash(stay.amountPaid)}` : 'Nothing paid'}{stay.source === 'Website' ? ' · online booking' : ''}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link to={reservationLink(stay, 'checkin')} className="min-h-10 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white">Check in</Link>
                <button type="button" onClick={() => setNoShow(stay)} className="min-h-10 rounded-lg border border-warning-300 px-3 py-2 text-xs font-semibold text-warning-800">Mark no-show</button>
              </div>
            </li>
          ))}
        </Group>
      )}
      {noShow && <NoShowDialog stay={noShow} onClose={() => setNoShow(null)} />}
      <Group title="Expected to check in" count={data.arrivals.waiting.length} empty="Everyone expected today has arrived.">
        {data.arrivals.waiting.map((stay) => (
          <Row key={stay.reservationRoomId} to={reservationLink(stay, 'checkin')} title={`Room ${stay.roomNumber || 'unassigned'} · ${stay.guestName}`}
            badge={stay.late ? `Due ${shortDate(stay.checkInDate)}` : stay.source === 'Website' ? 'Online' : null} badgeTone={stay.late ? 'danger' : 'primary'}
            lines={[`${stay.nightsBooked} night${stay.nightsBooked === 1 ? '' : 's'} · leaves ${shortDate(stay.checkOutDate)}`, stay.balanceDue > 0 ? `Balance to collect: ${cash(stay.balanceDue)}` : 'Paid in full']} />
        ))}
      </Group>
      <Group title="Arrived today" count={data.arrivals.arrivedToday.length} empty="No check-ins yet today.">
        {data.arrivals.arrivedToday.map((stay) => <Row key={stay.reservationRoomId} to={reservationLink(stay)} title={`Room ${stay.roomNumber || '—'} · ${stay.guestName}`} lines={[`Checked in at ${clock(stay.actualCheckIn)}`]} />)}
      </Group>
    </>
  );
}

// Reuses the existing no-show action; payments stay on the booking (refunds go through Refunds).
function NoShowDialog({ stay, onClose }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/reservations/${stay.reservationId}/no-show`, { reason }, { skipErrorToast: true });
      for (const key of ['dashboardGlance', 'reservations', 'rooms', 'operationalOverview', 'availability']) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(`${stay.guestName} marked as a no-show. Rooms released.`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not mark the no-show.');
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-labelledby="no-show-title">
      <form onSubmit={confirm} className="w-full max-w-md space-y-4 rounded-xl bg-surface p-5 shadow-xl">
        <h2 id="no-show-title" className="text-lg font-bold text-text">Mark {stay.guestName} as a no-show?</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-text-muted">
          <li>Room {stay.rooms.filter(Boolean).join(', ') || 'unassigned'} is released for the {stay.nightsLeft} remaining night{stay.nightsLeft === 1 ? '' : 's'}.</li>
          <li>{stay.amountPaid > 0 ? `${cash(stay.amountPaid)} paid stays on the booking. Refund it through Refunds only if your policy allows.` : 'Nothing has been paid.'}</li>
          <li>If this is a mistake, use Restore on the reservation.</li>
        </ul>
        <label className="block text-sm font-medium text-text">Reason (optional)
          <input maxLength={300} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Phone unreachable, did not arrive" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2 text-sm text-text" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm text-text">Cancel</button>
          <button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-warning-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Mark no-show</button>
        </div>
      </form>
    </div>
  );
}

function DeparturesDetail({ data }) {
  return (
    <>
      <Group title="Due to check out" count={data.departures.waiting.length} empty="No one else is due to leave today.">
        {data.departures.waiting.map((stay) => (
          <Row key={stay.reservationRoomId} to={reservationLink(stay, 'checkout')} title={`Room ${stay.roomNumber || '—'} · ${stay.guestName}`}
            badge={stay.minutesLate > 0 ? `${formatDuration(stay.minutesLate * 60000)} late` : `By ${formatTime(new Date(stay.expectedCheckoutAt))}`} badgeTone={stay.minutesLate > 0 ? 'danger' : 'warning'}
            lines={[stay.balanceDue > 0 ? `Balance owed: ${cash(stay.balanceDue)}` : 'Paid in full']} />
        ))}
      </Group>
      <Group title="Checked out today" count={data.departures.departedToday.length} empty="No checkouts yet today.">
        {data.departures.departedToday.map((stay) => <Row key={stay.reservationRoomId} to={reservationLink(stay)} title={`Room ${stay.roomNumber || '—'} · ${stay.guestName}`} lines={[`Left at ${clock(stay.actualCheckOut)}`, stay.balanceDue > 0 ? `Still owes ${cash(stay.balanceDue)}` : '']} />)}
      </Group>
    </>
  );
}

function InHouseDetail({ rows }) {
  return (
    <Group title="Checked-in guests" count={rows.length} empty="No guests are checked in.">
      {rows.map((stay) => (
        <Row key={stay.reservationRoomId} to={reservationLink(stay)} title={`Room ${stay.roomNumber || '—'} · ${stay.guestName}`}
          badge={stay.minutesLate > 0 ? 'Overdue' : null} badgeTone="danger"
          lines={[`Night ${Math.min(stay.nightsUsed + 1, stay.nightsBooked)} of ${stay.nightsBooked} · leaves ${shortDate(stay.checkOutDate)}`, stay.actualCheckIn ? `In room for ${formatDuration(Date.now() - new Date(stay.actualCheckIn).getTime())}` : '', stay.balanceDue > 0 ? `Balance owed: ${cash(stay.balanceDue)}` : 'Paid in full']} />
      ))}
    </Group>
  );
}

function FreeDetail({ rooms }) {
  const byType = rooms.reduce((groups, room) => ({ ...groups, [room.roomType]: [...(groups[room.roomType] || []), room] }), {});
  if (!rooms.length) return <p className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">Every room is taken tonight.</p>;
  return Object.entries(byType).map(([type, list]) => (
    <Group key={type} title={type} count={list.length}>
      {list.map((room) => (
        <Row key={room.roomId} to="/rooms" title={`Room ${room.roomNumber}`} badge={room.housekeepingStatus === 'Dirty' ? 'Needs cleaning' : 'Ready'} badgeTone={room.housekeepingStatus === 'Dirty' ? 'warning' : 'success'}
          lines={[room.isOnlineBookable === false ? 'Hidden from online booking' : '']} />
      ))}
    </Group>
  ));
}

function CollectedDetail({ money }) {
  return (
    <Group title="Payments received today" count={money.payments.length} empty="No payments recorded yet today.">
      {money.payments.map((payment) => (
        <Row key={payment.paymentId} to={reservationLink(payment)} title={`${cash(payment.amount)} · ${payment.method}`}
          lines={[`${clock(payment.at)} · ${payment.guestName}`, payment.receivedBy ? `Received by ${payment.receivedBy}` : '']} />
      ))}
    </Group>
  );
}

function UnpaidDetail({ money }) {
  return (
    <>
      <Group title="In-house guests with a balance" count={money.unpaidInHouse.length} empty="Every in-house booking is paid in full.">
        {money.unpaidInHouse.map((stay) => <Row key={stay.reservationId} to={reservationLink(stay, 'pay')} title={`${cash(stay.balanceDue)} · ${stay.guestName}`} lines={[`Room ${stay.roomNumber || '—'} · leaves ${shortDate(stay.checkOutDate)}`]} />)}
      </Group>
      {money.refundsPending > 0 && <Link to="/refunds" className="block rounded-lg border border-border p-3 text-sm font-semibold text-primary-700 hover:bg-primary-50/40">{money.refundsPending} refund{money.refundsPending === 1 ? '' : 's'} waiting · open Refunds</Link>}
    </>
  );
}

function AttentionDetail({ data }) {
  return (
    <>
      {data.approvalsPending > 0 && <Link to="/approvals" className="block rounded-lg border border-warning-200 bg-warning-50/50 p-3 text-sm font-semibold text-warning-800">{data.approvalsPending} request{data.approvalsPending === 1 ? '' : 's'} waiting for your approval · open Approvals</Link>}
      <Group title="Rooms needing cleaning" count={data.rooms.needsCleaning.length} empty="All rooms are clean.">
        {data.rooms.needsCleaning.map((room) => <Row key={room.roomId} to="/rooms" title={`Room ${room.roomNumber}`} lines={[room.roomType, room.operationalStatus === 'Occupied' ? 'Guest in room' : 'Empty']} />)}
      </Group>
      <Group title="Under maintenance" count={data.rooms.maintenance.length} empty="No rooms are under maintenance.">
        {data.rooms.maintenance.map((room) => <Row key={room.roomId} to="/rooms" title={`Room ${room.roomNumber}`} lines={[room.roomType, room.maintenanceReason ? `Reason: ${room.maintenanceReason}` : '']} />)}
      </Group>
    </>
  );
}
