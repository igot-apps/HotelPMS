import { createContext, useContext, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlarmClock, AlertTriangle, BedDouble, ChevronRight, Clock, Coins, Eye, Hotel, Loader2, LogIn, LogOut, Plus, Receipt, Search, Sparkles, Wallet, X } from 'lucide-react';
import api from '../../lib/axios';
import useCheckoutAlerts from '../../hooks/useCheckoutAlerts';
import { formatDuration, formatTime } from '../../lib/stayTiming';
import { bookingLink } from '../../lib/bookingLink';
import TakePaymentDialog from '../reservations/TakePaymentDialog';
import { updateGuestPresence } from '../../api/reservations';
import { useAuthStore } from '../../store/authStore';

const cash = (value) => `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const clock = (value) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const reservationLink = (row, action) => bookingLink(row, action);
// Which dashboard list a link was opened from, so the Reservations page can offer "Back to <list>".
const PanelContext = createContext(null);
const withBack = (to, panel) => (panel && to.startsWith('/reservations') ? `${to}${to.includes('?') ? '&' : '?'}back=${panel}` : to);
const RESULT = { present: 'still in the room', departed: 'has left', unlocated: 'could not be found' };

// The front desk's key questions for today. Each tile answers one question; click it for the details.
export default function TodayAtAGlance() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardGlance'],
    queryFn: async () => (await api.get('/dashboard/glance', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const alerts = useCheckoutAlerts();
  const owedAfter = useQuery({
    queryKey: ['owedAfterCheckout'],
    queryFn: async () => (await api.get('/dashboard/owed-after-checkout', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get('panel'));
  const [sort, setSort] = useState('date');
  const [arrivalsQuery, setArrivalsQuery] = useState('');
  // Coming back from the Reservations page: reopen the same list once, then tidy the URL.
  useEffect(() => {
    if (!searchParams.get('panel')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('panel');
    setSearchParams(next, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Arrivals are counted per booking (one party at the desk); the room total is shown alongside.
  const arrivingStays = [...data.arrivals.waiting, ...(data.arrivals.missed || [])];
  const arrivingBookings = new Set(arrivingStays.map((stay) => stay.reservationId)).size;
  const arrivedTodayRooms = data.arrivals.arrivedToday.length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const attention = data.rooms.needsCleaning.length + data.rooms.maintenance.length;
  const tiles = [
    { key: 'overdue', icon: AlarmClock, tone: overdue.length ? 'danger' : 'neutral', label: 'Overdue checkouts', value: overdue.length, hint: overdue.length ? `Longest: ${formatDuration(Math.max(...overdue.map((a) => a.minutesLate)) * 60000)} late` : `Checkout time ${data.checkOutTime}` },
    { key: 'arrivals', icon: LogIn, tone: missed.length ? 'warning' : 'primary', label: 'Expected arrivals', value: arrivingBookings, hint: [`Awaiting check-in: ${plural(arrivingBookings, 'reservation')} · ${plural(arrivingStays.length, 'room')}`, missed.length ? `${missed.length} past no-show time` : '', `Checked in today: ${plural(arrivedTodayRooms, 'room')}`, `${(data.arrivals.upcoming || []).length} in next 7 days`, data.arrivals.unpaidCount ? `${data.arrivals.unpaidCount} unpaid` : ''].filter(Boolean).join(' · ') },
    { key: 'departures', icon: LogOut, tone: 'warning', label: 'Departures to check out', value: data.departures.waiting.length, hint: `${data.departures.departedToday.length} checked out today` },
    { key: 'inHouse', icon: Hotel, tone: 'primary', label: 'Guests in house', value: data.inHouse.length, hint: `${data.rooms.occupiedTonight} of ${data.rooms.total} rooms taken tonight` },
    { key: 'free', icon: BedDouble, tone: 'success', label: 'Rooms free tonight', value: data.rooms.freeTonight.length, hint: `${data.rooms.occupancyPercent}% occupancy` },
    // Hotel-wide takings (desk + online) are for the manager; receptionists see their own in "You today".
    data.money.collectedToday !== null && { key: 'collected', icon: Coins, tone: 'success', label: 'Collected today', value: cash(data.money.collectedToday), hint: `${cash(data.money.collectedAtDesk)} at the desk · ${cash(data.money.collectedOnline)} online · ${data.money.payments.length} payment${data.money.payments.length === 1 ? '' : 's'}` },
    { key: 'unpaid', icon: Wallet, tone: data.money.unpaidInHouse.length ? 'warning' : 'neutral', label: 'Owed by guests in house', value: cash(data.money.inHouseOutstanding), hint: `${data.money.unpaidInHouse.length} booking${data.money.unpaidInHouse.length === 1 ? '' : 's'}${data.money.refundsPending ? ` · ${data.money.refundsPending} refund${data.money.refundsPending === 1 ? '' : 's'} pending` : ''}` },
    { key: 'owedAfter', icon: Receipt, tone: owedAfter.data?.bookings?.length ? 'danger' : 'neutral', label: 'Owed after checkout', value: owedAfter.isError ? '—' : cash(owedAfter.data?.total), hint: owedAfter.isError ? 'Could not load' : `${owedAfter.data?.bookings?.length || 0} guest${owedAfter.data?.bookings?.length === 1 ? '' : 's'} left owing` },
    { key: 'attention', icon: Sparkles, tone: attention ? 'warning' : 'neutral', label: 'Needs attention', value: attention, hint: `${data.rooms.needsCleaning.length} to clean · ${data.rooms.maintenance.length} maintenance${data.approvalsPending ? ` · ${data.approvalsPending} approvals` : ''}` },
  ].filter(Boolean);

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
        <PanelContext.Provider value={open}>
        <SortContext.Provider value={sort}>
        <Drawer title={tiles.find((tile) => tile.key === open)?.label || ''} onClose={() => setOpen(null)}
          toolbar={SORTABLE.includes(open) && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-text-muted">Sort by
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-10 rounded-lg border border-border bg-background px-2 text-sm text-text">
                  {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {open === 'arrivals' && (
                <div className="relative min-w-0 flex-1">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input value={arrivalsQuery} onChange={(event) => setArrivalsQuery(event.target.value)} placeholder="Search booking code, guest or room..." aria-label="Search expected arrivals" className="min-h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
                </div>
              )}
            </div>
          )}>
          {open === 'overdue' && <OverdueDetail rows={overdue} />}
          {open === 'arrivals' && <ArrivalsDetail data={data} missed={missed} query={arrivalsQuery} />}
          {open === 'departures' && <DeparturesDetail data={data} />}
          {open === 'inHouse' && <InHouseDetail rows={data.inHouse} />}
          {open === 'free' && <FreeDetail rooms={data.rooms.freeTonight} />}
          {open === 'collected' && <CollectedDetail money={data.money} />}
          {open === 'unpaid' && <UnpaidDetail money={data.money} />}
          {open === 'owedAfter' && <OwedAfterCheckoutDetail query={owedAfter} />}
          {open === 'attention' && <AttentionDetail data={data} />}
        </Drawer>
        </SortContext.Provider>
        </PanelContext.Provider>
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

export function Drawer({ title, onClose, children, toolbar }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        {toolbar && <div className="border-b border-border px-4 py-2">{toolbar}</div>}
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

const ACTION_TONES = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  success: 'bg-success-600 text-white hover:bg-success-700',
  warning: 'border border-warning-300 bg-warning-50 text-warning-700 hover:bg-warning-100',
};
const ACTION_ICONS = { view: Eye, book: Plus };

// A row opens the booking; its action buttons jump straight into that step (check in, check out,
// take payment) on the Reservations page, where the usual confirmations and checks run.
function Row({ to, title, code, lines = [], badge, badgeTone = 'neutral', actions = [] }) {
  const shown = actions.filter(Boolean);
  const panel = useContext(PanelContext);
  return (
    <li className="rounded-lg border border-border transition hover:border-primary-300">
      <Link to={withBack(to, panel)} className="block rounded-lg p-3 hover:bg-primary-50/30">
        {code && <span className="block text-xs font-bold uppercase tracking-wide text-primary-700">{code}</span>}<span className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{title}</span>{badge && <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${TONES[badgeTone]}`}>{badge}</span>}</span>
        {lines.filter(Boolean).map((line) => <span key={line} className="mt-0.5 block text-sm text-text-muted">{line}</span>)}
      </Link>
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          {shown.map(({ label, to: actionTo, tone = 'primary', icon }) => {
            const Icon = ACTION_ICONS[icon];
            return <Link key={label} to={withBack(actionTo, panel)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${ACTION_TONES[tone]}`}>{Icon && <Icon size={16} />} {label}</Link>;
          })}
        </div>
      )}
    </li>
  );
}

// Sorting for the lists in a pop-up (chosen in the pop-up header).
const SortContext = createContext('date');
const SORTS = [['date', 'Date'], ['room', 'Room'], ['guest', 'Guest name']];
const SORTABLE = ['overdue', 'arrivals', 'departures', 'inHouse', 'unpaid'];
function useSorted(rows, dateKey) {
  const sort = useContext(SortContext);
  const room = (row) => String(row.roomNumber ?? row.rooms?.[0] ?? '');
  return [...rows].sort((a, b) => (sort === 'room' ? room(a).localeCompare(room(b), undefined, { numeric: true })
    : sort === 'guest' ? String(a.guestName || '').localeCompare(String(b.guestName || ''))
    : new Date(a[dateKey] || 0) - new Date(b[dateKey] || 0)));
}
const stayDates = (stay) => `${shortDate(stay.checkInDate)} → ${shortDate(stay.checkOutDate)} · ${stay.nightsBooked ?? ''}${stay.nightsBooked ? ` night${stay.nightsBooked === 1 ? '' : 's'}` : ''}`.replace(/ · $/, '');

function OverdueDetail({ rows: unsorted }) {
  const rows = useSorted(unsorted, 'expectedCheckoutAt');
  return (
    <Group title="Guests past checkout time" count={rows.length} empty="No checkouts are overdue.">
      {rows.map((alert) => (
        <Row key={alert.reservationRoomId} to={reservationLink(alert)}
          actions={[{ label: 'View reservation', to: reservationLink(alert), icon: 'view' }]}
          title={`Room ${alert.roomNumber || '—'} · ${alert.guestName}`} code={alert.confirmationCode} badge={`${formatDuration(alert.minutesLate * 60000)} late`} badgeTone="danger"
          lines={[
            `Expected out ${formatTime(new Date(alert.expectedCheckoutAt))} on ${new Date(alert.expectedCheckoutAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
            alert.verification ? `Last check: guest ${RESULT[alert.verification.result]} · ${clock(alert.verification.at)}${alert.verification.by ? ` by ${alert.verification.by}` : ''}` : 'Not verified yet — use Verify in Checkout reminders',
            alert.balanceDue > 0 ? `Booking balance: ${cash(alert.balanceDue)}` : 'Paid in full',
            alert.escalated ? 'Escalated to the manager' : '',
          ]} />
      ))}
    </Group>
  );
}

// Group stays by reservationId and build a card with guest info, dates, balance, and room list.
function groupByReservation(stays) {
  return Object.values(stays.reduce((byRes, stay) => {
    const current = byRes[stay.reservationId];
    if (!current) {
      byRes[stay.reservationId] = {
        reservationId: stay.reservationId,
        guestName: stay.guestName,
        confirmationCode: stay.confirmationCode,
        phone: stay.phone || null,
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        nightsBooked: stay.nightsBooked,
        balanceDue: stay.balanceDue || 0,
        amountPaid: stay.amountPaid || 0,
        source: stay.source,
        rooms: [{ roomNumber: stay.roomNumber, reservationRoomId: stay.reservationRoomId, checkInStatus: stay.checkInStatus || (stay.actualCheckIn ? 'checked-in' : 'pending'), phone: stay.occupantPhone || stay.phone || null }],
      };
    } else {
      current.rooms.push({ roomNumber: stay.roomNumber, reservationRoomId: stay.reservationRoomId, checkInStatus: stay.checkInStatus || (stay.actualCheckIn ? 'checked-in' : 'pending'), phone: stay.occupantPhone || stay.phone || null });
    }
    return byRes;
  }, {}));
}

// Popup search: confirmation code, guest name, phone number or room number.
function matchesQuery(row, query) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const rooms = (row.rooms || []).map((room) => (typeof room === 'string' ? room : `${room.roomNumber || ''} ${room.phone || ''}`));
  return [row.confirmationCode, row.guestName, row.phone, ...rooms].filter(Boolean).join(' ').toLowerCase().includes(text);
}

function ArrivalsDetail({ data, missed: missedUnsorted, query = '' }) {
  const missed = useSorted(missedUnsorted, 'checkInDate').filter((row) => matchesQuery(row, query));
  const todayGrouped = groupByReservation(data.arrivals.waiting).filter((row) => matchesQuery(row, query));
  const upcomingGrouped = groupByReservation(data.arrivals.upcoming || []).filter((row) => matchesQuery(row, query));
  const arrivedGrouped = groupByReservation(data.arrivals.arrivedToday).filter((row) => matchesQuery(row, query));
  const searching = query.trim().length > 0;
  const noMatches = searching && !missed.length && !todayGrouped.length && !upcomingGrouped.length && !arrivedGrouped.length;

  if (noMatches) return <p className="rounded-lg border border-dashed border-border p-3 text-sm text-text-muted">No expected or arrived bookings match “{query.trim()}”.</p>;

  return (
    <>
      {missed.length > 0 && (
        <Group title="Still expected — past no-show time" count={missed.length}>
          {missed.map((stay) => (
            <li key={stay.reservationId} className="rounded-lg border border-warning-200 bg-warning-50/40 p-3">
              {stay.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{stay.confirmationCode}</p>}
              <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{stay.guestName}</span><span className="shrink-0 rounded-md bg-warning-100 px-2 py-0.5 text-xs font-bold text-warning-800">{stay.daysMissed ? `${stay.daysMissed} day${stay.daysMissed === 1 ? '' : 's'} missed` : 'Not arrived'}</span></p>
              <p className="mt-0.5 text-sm text-text-muted">Room {stay.rooms.filter(Boolean).join(', ') || 'unassigned'} · arrival {shortDate(stay.checkInDate)} · {stay.nightsLeft} night{stay.nightsLeft === 1 ? '' : 's'} still held</p>
              <p className="text-sm text-text-muted">{stay.amountPaid > 0 ? `Paid ${cash(stay.amountPaid)}` : 'Nothing paid'}{stay.source === 'Website' ? ' · online booking' : ''}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link to={withBack(reservationLink(stay), 'arrivals')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"><Eye size={16} /> View reservation</Link>
              </div>
            </li>
          ))}
        </Group>
      )}
      <Group title="Expected today" count={todayGrouped.length} empty={missed.length ? "No other arrivals due today." : "Everyone expected today has arrived."}>
        {todayGrouped.map((res) => (
          <li key={res.reservationId} className="rounded-lg border border-border p-3">
            {res.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{res.confirmationCode}</p>}
            <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{res.guestName}</span><span className="shrink-0 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">{res.rooms.length} room{res.rooms.length === 1 ? '' : 's'}</span></p>
            <p className="mt-0.5 text-sm text-text-muted">{shortDate(res.checkInDate)} → {shortDate(res.checkOutDate)} · {res.nightsBooked} night{res.nightsBooked === 1 ? '' : 's'}</p>
            <p className="text-sm text-text-muted">{res.balanceDue > 0 ? `Booking balance: ${cash(res.balanceDue)}` : 'Paid in full'}</p>
            <ul className="mt-2 space-y-1">
              {res.rooms.map((r) => (
                <li key={r.reservationRoomId} className="text-sm text-text-muted">Room {r.roomNumber || 'unassigned'} · {r.checkInStatus === 'checked-in' ? 'Checked in' : 'Awaiting check-in'}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={withBack(reservationLink(res), 'arrivals')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        ))}
      </Group>
      <Group title="Expected in the next 7 days" count={upcomingGrouped.length} empty="No arrivals booked for the next 7 days.">
        {upcomingGrouped.map((res) => (
          <li key={res.reservationId} className="rounded-lg border border-border p-3">
            {res.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{res.confirmationCode}</p>}
            <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{res.guestName}</span><span className="shrink-0 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">{res.rooms.length} room{res.rooms.length === 1 ? '' : 's'}</span></p>
            <p className="mt-0.5 text-sm text-text-muted">Arrives {shortDate(res.checkInDate)} · {shortDate(res.checkOutDate)}</p>
            <p className="text-sm text-text-muted">{res.balanceDue > 0 ? `Booking balance: ${cash(res.balanceDue)}` : 'Paid in full'}</p>
            <ul className="mt-2 space-y-1">
              {res.rooms.map((r) => (
                <li key={r.reservationRoomId} className="text-sm text-text-muted">Room {r.roomNumber || 'unassigned'}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={withBack(reservationLink(res), 'arrivals')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        ))}
      </Group>
      <Group title="Arrived today" count={arrivedGrouped.length} empty="No check-ins yet today.">
        {arrivedGrouped.map((res) => (
          <li key={res.reservationId} className="rounded-lg border border-border p-3">
            {res.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{res.confirmationCode}</p>}
            <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{res.guestName}</span><span className="shrink-0 rounded-md bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700">{res.rooms.length} room{res.rooms.length === 1 ? '' : 's'}</span></p>
            <p className="mt-0.5 text-sm text-text-muted">{shortDate(res.checkInDate)} → {shortDate(res.checkOutDate)} · {res.nightsBooked} night{res.nightsBooked === 1 ? '' : 's'}</p>
            <ul className="mt-2 space-y-1">
              {res.rooms.map((r) => (
                <li key={r.reservationRoomId} className="text-sm text-text-muted">Room {r.roomNumber || '—'} · Checked in</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={withBack(reservationLink(res), 'arrivals')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-text hover:bg-secondary-50"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        ))}
      </Group>
    </>
  );
}

function DeparturesDetail({ data }) {
  // Group by reservation, using check-out status fields for departures
  const groupWaiting = Object.values(data.departures.waiting.reduce((byRes, stay) => {
    const current = byRes[stay.reservationId];
    if (!current) {
      byRes[stay.reservationId] = {
        reservationId: stay.reservationId,
        guestName: stay.guestName,
        confirmationCode: stay.confirmationCode,
        expectedCheckoutAt: stay.expectedCheckoutAt,
        actualCheckOut: null,
        minutesLate: stay.minutesLate,
        balanceDue: stay.balanceDue || 0,
        amountPaid: stay.amountPaid || 0,
        source: stay.source,
        rooms: [{ roomNumber: stay.roomNumber, reservationRoomId: stay.reservationRoomId }],
      };
    } else {
      current.rooms.push({ roomNumber: stay.roomNumber, reservationRoomId: stay.reservationRoomId });
    }
    return byRes;
  }, {}));

  const groupDeparted = Object.values(data.departures.departedToday.reduce((byRes, stay) => {
    const current = byRes[stay.reservationId];
    if (!current) {
      byRes[stay.reservationId] = {
        reservationId: stay.reservationId,
        guestName: stay.guestName,
        confirmationCode: stay.confirmationCode,
        expectedCheckoutAt: null,
        actualCheckOut: stay.actualCheckOut,
        minutesLate: null,
        balanceDue: stay.balanceDue || 0,
        amountPaid: stay.amountPaid || 0,
        source: stay.source,
        rooms: [{ roomNumber: stay.roomNumber, reservationRoomId: stay.reservationRoomId }],
      };
    } else {
      current.rooms.push({ roomNumber: stay.roomNumber, reservationRoomId: stay.reservationRoomId });
    }
    return byRes;
  }, {}));

  const due = useSorted(groupWaiting, 'rooms?.[0]');
  const left = useSorted(groupDeparted, 'actualCheckOut');

  return (
    <>
      <Group title="Due to check out" count={due.length} empty="No one else is due to leave today.">
        {due.map((res) => (
          <li key={res.reservationId} className="rounded-lg border border-border p-3">
            {res.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{res.confirmationCode}</p>}
            <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{res.guestName}</span><span className="shrink-0 rounded-md bg-warning-50 px-2 py-0.5 text-xs font-bold text-warning-700">{res.rooms.length} room{res.rooms.length === 1 ? '' : 's'}</span></p>
            <p className="mt-0.5 text-sm text-text-muted">{res.expectedCheckoutAt ? `By ${formatTime(new Date(res.expectedCheckoutAt))}` : ''}{res.minutesLate > 0 ? ` · ${formatDuration(res.minutesLate * 60000)} late` : ''}</p>
            <p className="text-sm text-text-muted">{res.balanceDue > 0 ? `Booking balance: ${cash(res.balanceDue)}` : 'Paid in full'}</p>
            <ul className="mt-2 space-y-1">
              {res.rooms.map((r) => (
                <li key={r.reservationRoomId} className="text-sm text-text-muted">Room {r.roomNumber || '—'} {r.reservationRoomId === data.departures.waiting.find(w => w.reservationRoomId === r.reservationRoomId)?.actualCheckIn ? '(checked in)' : 'awaiting check-out'}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={withBack(reservationLink(res), 'departures')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        ))}
      </Group>
      <Group title="Checked out today" count={left.length} empty="No checkouts yet today.">
        {left.map((res) => (
          <li key={res.reservationId} className="rounded-lg border border-border p-3">
            {res.confirmationCode && <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{res.confirmationCode}</p>}
            <p className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{res.guestName}</span><span className="shrink-0 rounded-md bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700">{res.rooms.length} room{res.rooms.length === 1 ? '' : 's'}</span></p>
            <p className="mt-0.5 text-sm text-text-muted">{res.actualCheckOut ? `Left at ${clock(res.actualCheckOut)}` : ''}</p>
            <ul className="mt-2 space-y-1">
              {res.rooms.map((r) => (
                <li key={r.reservationRoomId} className="text-sm text-text-muted">Room {r.roomNumber || '—'} · checked out</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to={withBack(reservationLink(res), 'departures')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        ))}
      </Group>
    </>
  );
}

function InHouseDetail({ rows: unsorted }) {
  const rows = useSorted(unsorted, 'checkOutDate');
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [marking, setMarking] = useState(null);
  const presenceMutation = useMutation({
    mutationFn: ({ reservationRoomId, action, expectedReturnAt }) =>
      updateGuestPresence(reservationRoomId, action, expectedReturnAt),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', user?.propertyId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardGlance'] });
      toast.success(variables.action === 'out' ? 'Guest marked as out.' : 'Guest marked as returned.');
      setMarking(null);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Could not update guest presence.');
      setMarking(null);
    },
  });
  const isUpdating = (stay) => marking === stay.reservationRoomId || presenceMutation.isPending && presenceMutation.variables?.reservationRoomId === stay.reservationRoomId;
  return (
    <Group title="Checked-in guests" count={rows.length} empty="No guests are checked in.">
      {rows.map((stay) => {
        const out = stay.guestPresenceStatus === 'Out';
        return (
          <li key={stay.reservationRoomId} className="rounded-lg border border-border p-3">
            <Link to={withBack(reservationLink(stay), 'inHouse')} className="block hover:text-primary-700">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-text">{stay.guestName}</span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${out ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'}`}>
                  {out ? 'Out' : 'In room'}
                </span>
              </span>
              {stay.confirmationCode && <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-primary-700">{stay.confirmationCode}</p>}
              <p className="mt-0.5 text-sm text-text-muted">Room {stay.roomNumber || '—'} · leaves {shortDate(stay.checkOutDate)}</p>
              {stay.balanceDue > 0 && <p className="text-sm text-text-muted">{`Booking balance: ${cash(stay.balanceDue)}`}</p>}
              {out && stay.guestOutAt && (
                <p className="mt-0.5 text-xs text-warning-800 flex items-center gap-1">
                  <Clock size={12} /> Out since {new Date(stay.guestOutAt).toLocaleString()}
                </p>
              )}
              {out && stay.expectedReturnAt && (
                <p className="text-xs text-text-muted">Expected back {new Date(stay.expectedReturnAt).toLocaleString()}</p>
              )}
              {!out && stay.guestReturnedAt && (
                <p className="mt-0.5 text-xs text-success-700 flex items-center gap-1">
                  <Clock size={12} /> Returned at {new Date(stay.guestReturnedAt).toLocaleString()}
                </p>
              )}
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isUpdating(stay)}
                onClick={() => setMarking(stay.reservationRoomId)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${out ? 'bg-success-600 text-white hover:bg-success-700' : 'border border-warning-300 bg-surface text-warning-800 hover:bg-warning-50'} disabled:opacity-60`}
              >
                {isUpdating(stay) ? <Loader2 size={13} className="animate-spin" /> : out ? <LogIn size={13} /> : <LogOut size={13} />}
                {out ? 'Mark Returned' : 'Mark Guest Out'}
              </button>
              <Link to={withBack(reservationLink(stay), 'inHouse')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-text hover:bg-secondary-50"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        );
      })}
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
          lines={[room.isOnlineBookable === false ? 'Hidden from online booking' : '']}
          actions={[{ label: `Book Room ${room.roomNumber}`, to: `/reservations?new=1&room=${room.roomId}`, tone: 'success', icon: 'book' }]} />
      ))}
    </Group>
  ));
}

function CollectedDetail({ money }) {
  return (
    <Group title="Payments received today" count={money.payments.length} empty="No payments recorded yet today.">
      {money.payments.map((payment) => (
        <Row key={payment.paymentId} to={reservationLink(payment)} title={`${cash(payment.amount)} · ${payment.method}`} code={payment.confirmationCode}
          lines={[`${clock(payment.at)} · ${payment.guestName}`, payment.receivedBy ? `Received by ${payment.receivedBy}` : '']} />
      ))}
    </Group>
  );
}

function UnpaidDetail({ money }) {
  const unpaidRows = useSorted(money.unpaidInHouse, 'checkOutDate');
  // Collecting an in-house balance is a single payment on the booking, so it can be taken right here.
  const [paying, setPaying] = useState(null);
  return (
    <>
      <Group title="In-house guests with a balance" count={money.unpaidInHouse.length} empty="Every in-house booking is paid in full.">
        {unpaidRows.map((stay) => (
          <li key={stay.reservationId} className="rounded-lg border border-border p-3">
            <Link to={withBack(reservationLink(stay), 'unpaid')} className="block hover:text-primary-700">
              <span className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{stay.guestName}</span><span className="shrink-0 rounded-md bg-danger-50 px-2 py-0.5 text-xs font-bold text-danger-700">{cash(stay.balanceDue)}</span></span>
              <span className="mt-0.5 block text-sm text-text-muted">{stay.confirmationCode} · Room {stay.roomNumber || '—'} · leaves {shortDate(stay.checkOutDate)}</span>
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setPaying(stay)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-text-inverted hover:bg-primary-700"><Wallet size={16} /> Take payment</button>
              <Link to={withBack(reservationLink(stay), 'unpaid')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-text hover:bg-secondary-50"><Eye size={16} /> View reservation</Link>
            </div>
          </li>
        ))}
      </Group>
      {money.refundsPending > 0 && <Link to="/refunds" className="block rounded-lg border border-border p-3 text-sm font-semibold text-primary-700 hover:bg-primary-50/40">{money.refundsPending} refund{money.refundsPending === 1 ? '' : 's'} waiting · open Refunds</Link>}
      {paying && (
        <TakePaymentDialog
          key={paying.reservationId}
          reservation={{ reservationId: paying.reservationId, confirmationCode: paying.confirmationCode, guestNameSnapshot: paying.guestName, totalAmount: paying.balanceDue, amountPaid: 0 }}
          onClose={() => setPaying(null)}
        />
      )}
    </>
  );
}

// Guests who left still owing money. The amount is the booking's own balance, so a payment
// recorded on the booking removes it from this list.
function OwedAfterCheckoutDetail({ query }) {
  // Collecting a debt is a single payment on the booking, so it can be taken right here.
  const [paying, setPaying] = useState(null);
  if (query.isLoading) return <p className="flex items-center gap-2 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</p>;
  if (query.isError) return <p className="text-sm text-danger-700">Could not load this list. Please try again.</p>;
  const rows = query.data?.bookings || [];
  return (
    <Group title="Checked out with money owed" count={rows.length} empty="No guest has left owing money.">
      {rows.map((row) => (
        <li key={row.reservationId} className="rounded-lg border border-border p-3">
          <Link to={`/reservations/${row.reservationId}`} className="block hover:text-primary-700">
            <span className="flex items-start justify-between gap-2"><span className="font-semibold text-text">{row.guestName}</span><span className="shrink-0 rounded-md bg-danger-50 px-2 py-0.5 text-xs font-bold text-danger-700">{cash(row.balanceDue)}</span></span>
            <span className="mt-0.5 block text-sm text-text-muted">{row.confirmationCode} · Room {row.roomNumbers.join(', ') || '—'}{row.checkedOutAt ? ` · left ${shortDate(row.checkedOutAt)}` : ''}</span>
            <span className="mt-0.5 block text-sm text-text-muted">Reason: {row.reason || 'Not recorded'}</span>
            <span className="mt-0.5 block text-sm text-text-muted">Approved by: {row.approvedBy || 'Not recorded'}</span>
          </Link>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setPaying(row)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-text-inverted hover:bg-primary-700"><Wallet size={16} /> Take payment</button>
            <Link to={withBack(reservationLink(row), 'owedAfter')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-text hover:bg-secondary-50"><Eye size={16} /> View reservation</Link>
          </div>
        </li>
      ))}
      {paying && (
        <TakePaymentDialog
          key={paying.reservationId}
          reservation={{ reservationId: paying.reservationId, confirmationCode: paying.confirmationCode, guestNameSnapshot: paying.guestName, totalAmount: paying.totalAmount, amountPaid: paying.amountPaid }}
          onClose={() => setPaying(null)}
        />
      )}
    </Group>
  );
}

// One tap to mark a room clean, using the same room update as the Rooms page.
function CleaningRow({ room }) {
  const queryClient = useQueryClient();
  const canUpdate = useAuthStore((state) => state.permissions?.includes('CanUpdateRoomStatus'));
  const [saving, setSaving] = useState(false);
  const markClean = async () => {
    setSaving(true);
    try {
      await api.patch(`/rooms/${room.roomId}/status`, { operationalStatus: room.operationalStatus, housekeepingStatus: 'Clean' });
      toast.success(`Room ${room.roomNumber} marked clean.`);
      for (const key of ['dashboardGlance', 'rooms', 'operationalOverview']) queryClient.invalidateQueries({ queryKey: [key] });
    } catch {
      // The request layer already shows the error.
      setSaving(false);
    }
  };
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <Link to="/rooms" className="min-w-0 hover:text-primary-700">
        <span className="block font-semibold text-text">Room {room.roomNumber}</span>
        <span className="block text-sm text-text-muted">{room.roomType} · {room.operationalStatus === 'Occupied' ? 'Guest in room' : 'Empty'}</span>
      </Link>
      {canUpdate && (
        <button type="button" disabled={saving} onClick={markClean} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-success-600 px-3 text-sm font-semibold text-white hover:bg-success-700 disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Mark clean
        </button>
      )}
    </li>
  );
}

function AttentionDetail({ data }) {
  return (
    <>
      <Group title="Rooms needing cleaning" count={data.rooms.needsCleaning.length} empty="All rooms are clean.">
        {data.rooms.needsCleaning.map((room) => <CleaningRow key={room.roomId} room={room} />)}
      </Group>
      <Group title="Under maintenance" count={data.rooms.maintenance.length} empty="No rooms are under maintenance.">
        {data.rooms.maintenance.map((room) => <Row key={room.roomId} to="/rooms" title={`Room ${room.roomNumber}`} lines={[room.roomType, room.maintenanceReason ? `Reason: ${room.maintenanceReason}` : '']} />)}
      </Group>
    </>
  );
}
