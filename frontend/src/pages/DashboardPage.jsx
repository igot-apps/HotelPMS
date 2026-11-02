import { useState } from 'react';
import RequirePermission from '../components/RequirePermission';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getOperationalOverview } from '../api/dashboard';
import { getProperties } from '../api/properties';
import { useAuthStore } from '../store/authStore';
import {
  UserPlus, UserMinus, BedDouble, Sparkles, AlertTriangle,
  Calendar, Search, RefreshCw, LayoutGrid, ArrowRight,
  Loader2, Building2, CheckCircle2
} from 'lucide-react';

// ==========================================
// 🌟 NEW: ONBOARDING CHECKLIST COMPONENT
// ==========================================
const SetupChecklist = () => {
  const steps = [
    { 
      id: 1, 
      title: 'Create Room Types', 
      desc: 'Define your categories (e.g., Standard, Deluxe) and set base prices.', 
      link: '/room-management', // ✅ FIXED
      icon: BedDouble 
    },
    { 
      id: 2, 
      title: 'Add Physical Rooms', 
      desc: 'Add your actual room numbers (e.g., 101, 102) and assign them to a type.', 
      link: '/room-management', // ✅ FIXED
      icon: Building2 
    },
    { 
      id: 3, 
      title: 'Enable Online Booking', 
      desc: 'Turn on public bookings to start accepting reservations from your website.', 
      link: '/properties', 
      icon: CheckCircle2 
    },
  ];

  return (
    <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-100 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 bg-primary-600 rounded-xl shadow-sm shadow-primary-600/20">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-text">Welcome to Hotel PMS! Let's get you set up. 🚀</h2>
          <p className="text-sm text-text-muted">Complete these 3 steps to start managing your property.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step) => (
          <Link 
            key={step.id} 
            to={step.link}
            className="group flex items-start gap-4 p-4 bg-white rounded-xl border border-border hover:border-primary-300 hover:shadow-md transition-all duration-300"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm group-hover:bg-primary-600 group-hover:text-white transition-colors">
              {step.id}
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-text group-hover:text-primary-600 transition-colors flex items-center gap-2">
                {step.title}
                <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{step.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const user = useAuthStore(state => state.user);
  const [propertyId, setPropertyId] = useState(user?.propertyId || '');
  const { data: properties = [] } = useQuery({ queryKey: ['properties'], enabled: !user?.propertyId,
    queryFn: async () => (await getProperties()).data.data || [],
  });
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['operationalOverview', propertyId], enabled: Boolean(propertyId),
    queryFn: async () => (await getOperationalOverview({ propertyId })).data.data,
    refetchInterval: 60000,
  });
  const timeZone = data?.timeZone || 'Africa/Accra';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-GH', { timeZone, weekday: 'long', month: 'long', day: 'numeric' });
  const tasks = data?.taskCounts || {};
  const stats = data?.roomStats || {};
  const propertyName = user?.propertyName || properties.find(p => p.propertyId === Number(propertyId))?.propertyName;
  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><p className="mb-1 text-sm font-semibold text-primary-700">{propertyName || 'Hotel dashboard'}</p><h1 className="text-2xl font-bold text-text">{greeting}, {user?.fullName?.split(' ')[0] || 'Team'}</h1><p className="mt-2 text-sm text-text-muted">{today} · {timeZone} · Your front desk at a glance</p></div>
      <div className="flex flex-wrap gap-2">
        {!user?.propertyId && <select aria-label="Select hotel" className="min-w-0 rounded-lg border border-border bg-surface p-2 text-text" value={propertyId} onChange={e => setPropertyId(e.target.value)}><option value="">Select a hotel</option>{properties.map(p => <option key={p.propertyId} value={p.propertyId}>{p.propertyName}</option>)}</select>}
        <button disabled={isFetching || !propertyId} onClick={() => refetch()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text disabled:opacity-50"><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />Refresh</button>
      </div>
    </header>

    <section aria-labelledby="quick-actions-title" className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 id="quick-actions-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-text"><LayoutGrid size={17} className="text-primary-600" /> Quick Actions</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink to="/availability" icon={Search} label="Check availability / Walk-in" color="primary" />
        <RequirePermission permission="CanCreateReservation"><QuickLink to="/reservations" icon={Calendar} label="Reservations & payments" color="success" /></RequirePermission>
        <QuickLink to="/rooms" icon={BedDouble} label="Rooms & housekeeping" color="warning" />
        {user?.role === 'Manager' && <QuickLink to="/reports" icon={LayoutGrid} label="Daily overview & collections" color="secondary" />}
      </div>
    </section>

    {error && <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">Could not refresh the dashboard. {data ? 'The figures below are from the last successful update.' : 'Use Refresh to try again.'}</div>}
    {!propertyId && <p className="rounded-xl border border-border bg-surface p-6 text-text-muted">Select a hotel to view its operations.</p>}
    {isLoading && <p role="status" className="flex items-center justify-center gap-3 rounded-xl border border-border bg-surface p-10 text-text-muted"><Loader2 className="animate-spin" size={24} /> Loading front desk overview…</p>}
    {data && <>
      {data.totalRooms === 0 && <SetupChecklist />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpCard icon={UserPlus} label="Awaiting check-in" value={tasks.arrivals || 0} subtext={`Rooms due today or earlier · ${tasks.overdueArrivals || 0} overdue`} color="primary" />
        <OpCard icon={UserMinus} label="Awaiting checkout" value={tasks.departures || 0} subtext={`In-house rooms due today or earlier · ${tasks.overdueDepartures || 0} overdue`} color="warning" />
        <OpCard icon={BedDouble} label="Ready rooms now" value={stats.Available || 0} subtext={`${stats.Occupied || 0} occupied · ${data.totalRooms} total rooms`} color="success" />
        <OpCard icon={Sparkles} label="Rooms needing attention" value={data.alerts.length} subtext={`${stats.Dirty || 0} dirty · ${stats.Maintenance || 0} under maintenance`} color="danger" />
      </div>
      <p className="text-xs text-text-muted">Ready rooms are unoccupied, clean or inspected, and active. Use Check availability to confirm availability for booking dates. Dirty and maintenance totals can overlap.</p>
      <div className="grid gap-5 xl:grid-cols-2">
        <TaskQueue title="Check-ins to handle" icon={UserPlus} reservations={data.arrivals} departure={false} />
        <TaskQueue title="Checkouts to handle" icon={UserMinus} reservations={data.departures} departure />
      </div>
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-text"><AlertTriangle size={18} className="text-warning-600" /> Housekeeping & maintenance</h2>
        {!data.alerts.length ? <p className="py-4 text-sm text-success-700">No dirty rooms or maintenance alerts.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.alerts.map(room => <Link key={room.roomId} to="/rooms" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 hover:border-primary-300"><div><p className="font-bold text-text">Room {room.roomNumber}</p><p className="mt-1 text-xs text-text-muted">{[room.housekeepingStatus === 'Dirty' && 'Needs cleaning', room.operationalStatus === 'Maintenance' && 'Under maintenance'].filter(Boolean).join(' · ')}</p></div><span className="flex items-center gap-1 text-sm font-semibold text-primary-700">Manage <ArrowRight size={15} /></span></Link>)}</div>}
      </section>
      <p className="text-xs text-text-muted">Last updated {new Date(data.generatedAt).toLocaleTimeString('en-GH', { timeZone, hour: '2-digit', minute: '2-digit' })} · Refreshes every minute.</p>
    </>}
  </div>;
}

function TaskQueue({ title, icon: Icon, reservations, departure }) {
  return <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary-50 p-4"><h2 className="flex items-center gap-2 font-bold text-text"><Icon size={18} className="text-primary-600" />{title}</h2><span className="text-xs text-text-muted">{reservations.length} bookings</span></div>
    {!reservations.length ? <p className="p-8 text-center text-sm text-text-muted">No {departure ? 'checkouts' : 'check-ins'} waiting for today or earlier.</p> : <ul className="max-h-[28rem] space-y-3 overflow-y-auto p-3">{reservations.map(res => <li key={res.reservationId} className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-bold text-text">{res.guest.fullName}</p>{res.overdue && <span className="rounded-md bg-danger-50 px-2 py-1 text-xs font-bold text-danger-700">Overdue</span>}</div>
      <div className="mt-2 space-y-1 text-sm text-text-muted">{res.reservationRooms.map(stay => <p key={stay.reservationRoomId}>Room {stay.room?.roomNumber || stay.roomNumberSnapshot || 'unassigned'} · {departure ? 'Departure' : 'Arrival'} {new Date(departure ? stay.checkOutDate : stay.checkInDate).toLocaleDateString('en-GH', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</p>)}</div>
      {departure && <p className={`mt-2 text-sm font-semibold ${res.balanceDue > 0 ? 'text-danger-700' : 'text-success-700'}`}>{res.balanceDue > 0 ? `Booking balance: GHS ${res.balanceDue.toFixed(2)}` : 'Booking paid in full'}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><span className="break-all text-xs text-text-muted">{res.confirmationCode || res.reservationId}</span><Link to={`/reservations?search=${encodeURIComponent(res.confirmationCode || res.reservationId)}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700">Open reservation <ArrowRight size={14} /></Link></div>
    </li>)}</ul>}
  </section>;
}

function OpCard({ icon: Icon, label, value, subtext, color }) {
  const colors = { primary: 'bg-primary-50 text-primary-600', warning: 'bg-warning-50 text-warning-600', success: 'bg-success-50 text-success-600', danger: 'bg-danger-50 text-danger-600' };
  return <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-text-muted">{label}</p><span className={`rounded-lg p-2 ${colors[color]}`}><Icon size={19} /></span></div><p className="mt-2 text-3xl font-bold text-text">{value}</p><p className="mt-2 text-xs leading-relaxed text-text-muted">{subtext}</p></div>;
}
function QuickLink({ to, icon: Icon, label, color }) {
  const colors = { primary: 'bg-primary-50 text-primary-600', secondary: 'bg-secondary-50 text-secondary-600', success: 'bg-success-50 text-success-600', warning: 'bg-warning-50 text-warning-600' };
  return <Link to={to} className={`flex min-h-14 items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary-300 ${colors[color]}`}><Icon size={20} className="shrink-0" /><span className="min-w-0 flex-1 text-sm font-semibold text-text">{label}</span><ArrowRight size={16} className="shrink-0" /></Link>;
}