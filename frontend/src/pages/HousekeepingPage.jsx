import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useManualRefresh from '../hooks/useManualRefresh';
import { Sparkles, CheckCircle2, Wrench, BedDouble, RefreshCw, LogOut, LogIn, CalendarDays, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getHousekeepingOverview, setCleaningStatus } from '../api/housekeeping';
import { useAuthStore } from '../store/authStore';

const tabs = [
  { id: 'needs', label: 'Needs cleaning', icon: Sparkles },
  { id: 'ready', label: 'Ready', icon: CheckCircle2 },
  { id: 'occupied', label: 'Occupied', icon: BedDouble },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
];
const ranges = [{ id: 'today', label: 'Today' }, { id: 'tomorrow', label: 'Tomorrow' }, { id: 'week', label: 'Next 7 days' }];
const PRIORITY = {
  urgent: { label: 'Urgent', className: 'bg-danger-50 text-danger-700' },
  high: { label: 'High', className: 'bg-warning-50 text-warning-800' },
  normal: { label: 'Normal', className: 'bg-secondary-100 text-secondary-700' },
};
const ROOM_STATE = {
  needs: { label: 'Needs cleaning', className: 'bg-warning-50 text-warning-800' },
  ready: { label: 'Ready', className: 'bg-success-50 text-success-700' },
  occupied: { label: 'Occupied', className: 'bg-secondary-100 text-secondary-700' },
  maintenance: { label: 'Maintenance', className: 'bg-secondary-100 text-secondary-700' },
};

const card = 'rounded-xl border border-border bg-surface';
const badge = 'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold';

// Hotel dates arrive as YYYY-MM-DD; format them without shifting the day.
const addDays = (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const longDate = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00Z`));
const shortDate = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T00:00:00Z`));
const dayName = (date, today) => (date === today ? 'today' : date === addDays(today, 1) ? 'tomorrow' : shortDate(date));
const clock = (time) => {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const roomTitle = (row) => (row.roomNumber ? `Room ${row.roomNumber}` : 'Room not assigned yet');

function roomDetail(room, data) {
  const today = data.date;
  if (room.group === 'needs' || room.group === 'ready') {
    return room.nextArrivalDate ? `Next guest arrives ${dayName(room.nextArrivalDate, today)}${room.nextArrivalDate <= today ? `, from ${clock(data.checkInTime)}` : ''}` : 'No guest arriving soon';
  }
  if (room.group === 'occupied') {
    if (!room.departureDate) return 'Guest staying';
    if (room.departureLate) return 'Guest is past checkout time';
    return `Guest due out ${dayName(room.departureDate, today)}${room.departureDate === today ? ` at ${clock(data.checkOutTime)}` : ''}`;
  }
  return room.maintenanceReason || 'Under maintenance';
}

function ConfirmSheet({ room, onConfirm, onCancel, busy }) {
  if (!room) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-dirty-title">
      <div className={`${card} w-full max-w-sm p-5 shadow-xl`}>
        <h2 id="confirm-dirty-title" className="text-lg font-bold text-text">Mark Room {room.roomNumber} as needs cleaning?</h2>
        <p className="mt-2 text-sm text-text-muted">The room will no longer show as ready for guests until someone marks it ready again.</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-border px-4 text-sm font-semibold text-text">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="min-h-11 flex-1 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Yes, needs cleaning</button>
        </div>
      </div>
    </div>
  );
}

function RoomsView({ data, tab, setTab, onMark, pendingRoomId, setView }) {
  const counts = Object.fromEntries(tabs.map(item => [item.id, data.rooms.filter(room => room.group === item.id).length]));
  const visible = data.rooms.filter(room => room.group === tab);
  const [today, tomorrow] = data.days;
  const upcoming = [
    { label: 'Checkouts today', value: today?.checkouts.length || 0, icon: LogOut, range: 'today' },
    { label: 'Check-ins today', value: today?.checkins.length || 0, icon: LogIn, range: 'today' },
    { label: 'Checkouts tomorrow', value: tomorrow?.checkouts.length || 0, icon: CalendarDays, range: 'tomorrow' },
  ];
  return <>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tabs.map(item => <button type="button" key={item.id} onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`min-h-16 rounded-xl border p-3 text-left transition ${tab === item.id ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-border bg-surface text-text hover:border-primary-300'}`}><span className="flex items-center gap-2 text-sm font-semibold"><item.icon size={16} />{item.label}</span><span className="mt-1 block text-xl font-bold">{counts[item.id]}</span></button>)}</div>

    <section aria-labelledby="rooms-list-title" className="space-y-3">
      <h2 id="rooms-list-title" className="text-lg font-bold text-text">{tab === 'needs' ? 'Needs attention now' : tabs.find(item => item.id === tab)?.label}</h2>
      {visible.length === 0 ? <div className={`${card} p-8 text-center text-text-muted`}>{tab === 'needs' ? 'All rooms are clean. Nice work!' : `No rooms in ${tabs.find(item => item.id === tab)?.label.toLowerCase()}.`}</div>
        : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(room => {
          const tag = room.priority ? PRIORITY[room.priority] : ROOM_STATE[room.group];
          const busy = pendingRoomId === room.roomId;
          return <article key={room.roomId} className={`${card} p-5 shadow-sm`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="text-xl font-bold text-text">Room {room.roomNumber}</h3><p className="mt-1 text-sm text-text-muted">{room.roomType}{room.floor != null ? ` · Floor ${room.floor}` : ''}</p></div>
              <span className={`${badge} ${tag.className}`}>{tag.label}</span>
            </div>
            <p className="mt-2 text-sm text-text">{roomDetail(room, data)}</p>
            {room.group === 'needs' && <button type="button" onClick={() => onMark(room, 'Clean')} disabled={busy} aria-busy={busy} className="mt-4 min-h-11 w-full rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{busy ? 'Saving…' : 'Mark ready'}</button>}
            {room.group === 'ready' && <button type="button" onClick={() => onMark(room, 'Dirty')} disabled={busy} aria-busy={busy} className="mt-4 min-h-11 w-full rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-secondary-50 disabled:opacity-50">{busy ? 'Saving…' : 'Mark needs cleaning'}</button>}
          </article>;
        })}</div>}
    </section>

    <section aria-labelledby="upcoming-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 id="upcoming-title" className="text-lg font-bold text-text">Upcoming work</h2><button type="button" onClick={() => setView('schedule', 'today')} className="min-h-11 text-sm font-semibold text-primary-700">See schedule</button></div>
      <div className="grid grid-cols-3 gap-2">{upcoming.map(item => <button type="button" key={item.label} onClick={() => setView('schedule', item.range)} className={`${card} min-h-20 p-3 text-left hover:border-primary-300`}><item.icon size={16} className="text-primary-600" /><span className="mt-1 block text-xl font-bold text-text">{item.value}</span><span className="block text-xs font-medium text-text-muted">{item.label}</span></button>)}</div>
    </section>
  </>;
}

function ScheduleDay({ day, data, showDate }) {
  const today = data.date;
  return <div className="space-y-4">
    {showDate && <h2 className="border-b border-border pb-1 text-base font-bold text-text">{day.date === today ? 'Today' : day.date === addDays(today, 1) ? 'Tomorrow' : longDate(day.date)}</h2>}
    <section aria-label="Expected checkouts" className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted"><LogOut size={15} /> Expected checkouts · {day.checkouts.length}</h3>
      {day.checkouts.length === 0 ? <p className="text-sm text-text-muted">No checkouts expected.</p> : day.checkouts.map((row, i) => <div key={`o${i}`} className={`${card} flex items-start justify-between gap-3 p-4`}>
        <div className="min-w-0"><p className="font-bold text-text">{roomTitle(row)}</p><p className="mt-0.5 text-sm text-text-muted">{row.roomType}{row.nextArrivalDate ? ` · Next guest arrives ${dayName(row.nextArrivalDate, today)}` : ' · No guest arriving after'}</p></div>
        <div className="text-right"><p className="text-sm font-semibold text-text">{row.late ? 'Past checkout' : clock(data.checkOutTime)}</p><p className="text-xs text-text-muted">{row.stayStatus === 'CheckedIn' ? 'Still occupied' : 'Not arrived yet'}</p></div>
      </div>)}
    </section>
    <section aria-label="Expected check-ins" className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-muted"><LogIn size={15} /> Expected check-ins · {day.checkins.length}</h3>
      {day.checkins.length === 0 ? <p className="text-sm text-text-muted">No check-ins expected.</p> : day.checkins.map((row, i) => <div key={`i${i}`} className={`${card} flex items-start justify-between gap-3 p-4`}>
        <div className="min-w-0"><p className="font-bold text-text">{roomTitle(row)}</p><p className="mt-0.5 text-sm text-text-muted">{row.roomType}{row.late ? ' · Guest is late' : ` · From ${clock(data.checkInTime)}`}</p></div>
        {row.roomStatus && <span className={`${badge} ${ROOM_STATE[row.roomStatus].className}`}>{ROOM_STATE[row.roomStatus].label}</span>}
      </div>)}
    </section>
  </div>;
}

function ScheduleView({ data, range, setRange }) {
  const days = range === 'today' ? data.days.slice(0, 1) : range === 'tomorrow' ? data.days.slice(1, 2) : data.days;
  return <>
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1" role="group" aria-label="Schedule range">{ranges.map(item => <button type="button" key={item.id} onClick={() => setRange(item.id)} aria-pressed={range === item.id} className={`min-h-11 rounded-lg text-sm font-semibold ${range === item.id ? 'bg-primary-600 text-white' : 'text-text'}`}>{item.label}</button>)}</div>
    <p className="flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800"><Info size={16} className="mt-0.5 shrink-0" /> An expected checkout does not mean the guest has left. Start cleaning once reception records the checkout and the room shows as needs cleaning.</p>
    <div className="space-y-6">{days.map(day => <ScheduleDay key={day.date} day={day} data={data} showDate={range === 'week'} />)}</div>
  </>;
}

export default function HousekeepingPage() {
  const [tab, setTab] = useState('needs');
  const [confirmRoom, setConfirmRoom] = useState(null);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'schedule' ? 'schedule' : 'rooms';
  const range = ranges.some(item => item.id === params.get('range')) ? params.get('range') : 'today';
  const setView = (next, nextRange) => setParams(next === 'schedule' ? { view: 'schedule', ...(nextRange ? { range: nextRange } : {}) } : {}, { replace: true });
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const queryKey = ['housekeeping', user?.propertyId];
  const { data, isPending, error, refetch } = useQuery({ queryKey, queryFn: () => getHousekeepingOverview().then(result => result.data.data), enabled: Boolean(user?.propertyId && user?.housekeepingEnabled), refetchInterval: 30000 });
  const [refresh, refreshing] = useManualRefresh(refetch);
  const mutation = useMutation({
    mutationFn: ({ roomId, status }) => setCleaningStatus(roomId, status),
    onSuccess: () => { setConfirmRoom(null); queryClient.invalidateQueries({ queryKey }); queryClient.invalidateQueries({ queryKey: ['rooms', user?.propertyId] }); toast.success('Room status updated.'); },
    onError: err => { setConfirmRoom(null); toast.error(err.response?.data?.message || 'Could not update room.'); queryClient.invalidateQueries({ queryKey }); },
  });
  const pendingRoomId = mutation.isPending ? mutation.variables?.roomId : null;
  const onMark = (room, status) => (status === 'Dirty' ? setConfirmRoom(room) : mutation.mutate({ roomId: room.roomId, status }));

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-text sm:text-3xl">{view === 'schedule' ? 'Housekeeping schedule' : 'Housekeeping'}</h1><p className="mt-1 text-sm text-text-muted">{data?.date ? longDate(data.date) : `Room readiness for ${user?.propertyName || 'your property'}`}</p></div>
      <button type="button" onClick={refresh} disabled={!user?.housekeepingEnabled || refreshing} aria-busy={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text disabled:opacity-50"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
    </div>
    {!user?.housekeepingEnabled ? <div className={`${card} p-6`}><h2 className="font-semibold text-text">Housekeeping is off</h2><p className="mt-2 text-sm text-text-muted">A manager can turn it on in Staff Management. Reception can still update room readiness in Rooms & Inventory.</p></div> : <>
      <div className="hidden grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1 md:grid md:max-w-xs" role="group" aria-label="Housekeeping view">{[['rooms', 'Rooms'], ['schedule', 'Schedule']].map(([id, label]) => <button type="button" key={id} onClick={() => setView(id)} aria-pressed={view === id} className={`min-h-10 rounded-lg text-sm font-semibold ${view === id ? 'bg-primary-600 text-white' : 'text-text'}`}>{label}</button>)}</div>
      {error ? <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">Could not load housekeeping. Please refresh.</div>
        : isPending ? <div className={`${card} p-8 text-center text-text-muted`}>Loading rooms…</div>
          : view === 'schedule' ? <ScheduleView data={data} range={range} setRange={next => setView('schedule', next)} />
            : <RoomsView data={data} tab={tab} setTab={setTab} onMark={onMark} pendingRoomId={pendingRoomId} setView={setView} />}
    </>}
    <ConfirmSheet room={confirmRoom} busy={mutation.isPending} onCancel={() => setConfirmRoom(null)} onConfirm={() => mutation.mutate({ roomId: confirmRoom.roomId, status: 'Dirty' })} />
  </div>;
}
