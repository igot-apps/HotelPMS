import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getOperationalOverview } from '../api/dashboard';
import { getProperties } from '../api/properties';
import { useAuthStore } from '../store/authStore';
import { 
  UserPlus, UserMinus, BedDouble, Sparkles, AlertTriangle, 
  Calendar, Search, CreditCard, RefreshCw, LayoutGrid, ArrowRight,
  Phone, Loader2
} from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const [propertyId, setPropertyId] = useState('');

  // Fetch Properties for filter
  const { data: propsData } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties().then(res => res.data.data || res.data || []),
  });
  const properties = propsData || [];

  // Fetch Operational Data
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['operationalOverview', propertyId],
    queryFn: () => {
      const params = {};
      if (propertyId) params.propertyId = propertyId;
      return getOperationalOverview(params).then(res => res.data.data);
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds for live updates!
  });

  const arrivals = data?.arrivals || [];
  const departures = data?.departures || [];
  const roomStats = data?.roomStats || {};
  const alerts = data?.alerts || [];
  const totalRooms = data?.totalRooms || 0;

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* ========================================== */}
      {/* HEADER                                     */}
      {/* ========================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">
            {greeting}, {user?.fullName?.split(' ')[0] || 'Team'}! 👋
          </h1>
          <p className="text-text-muted text-sm mt-1">{todayStr} • Here is your shift overview.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:bg-secondary-50 transition shadow-sm">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-text focus:ring-2 focus:ring-primary-500/20 outline-none min-w-[160px] shadow-sm">
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.propertyId} value={p.propertyId}>{p.propertyName}</option>)}
          </select>
        </div>
      </div>

      {/* ========================================== */}
      {/* LOADING STATE                              */}
      {/* ========================================== */}
      {isLoading && !data && (
        <div className="bg-surface border border-border rounded-xl p-16 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Loader2 className="animate-spin text-primary-500" size={40} />
          <p className="font-semibold text-lg">Loading shift overview...</p>
        </div>
      )}

      {data && (
        <>
          {/* ========================================== */}
          {/* 🌟 OPERATIONAL KPI CARDS                   */}
          {/* ========================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <OpCard icon={UserPlus} label="Arrivals Today" value={arrivals.length} subtext="Confirmed Check-ins" color="primary" />
            <OpCard icon={UserMinus} label="Departures Today" value={departures.length} subtext="Checked-in Guests" color="warning" />
            <OpCard icon={BedDouble} label="Available Rooms" value={roomStats['Available'] || 0} subtext={`Out of ${totalRooms} Total`} color="success" />
            <OpCard icon={Sparkles} label="Dirty / Alerts" value={alerts.length} subtext="Needs Attention" color="danger" />
          </div>

          {/* ========================================== */}
          {/* 🌟 MAIN ACTION LISTS                       */}
          {/* ========================================== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Today's Arrivals */}
            <div className="bg-surface border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-primary-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <UserPlus size={16} className="text-primary-600" /> Today's Arrivals ({arrivals.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto max-h-80 p-2">
                {arrivals.length === 0 ? (
                  <p className="text-text-muted text-sm text-center py-8">No arrivals scheduled for today.</p>
                ) : (
                  <ul className="space-y-2">
                    {arrivals.map(res => (
                      <li key={res.reservationId} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border hover:border-primary-300 transition">
                        <div>
                          <p className="text-sm font-bold text-text">{res.guest?.fullName}</p>
                          <p className="text-xs text-text-muted">
                            Room {res.reservationRooms[0]?.room?.roomNumber || 'TBD'} • Res #{res.reservationId}
                          </p>
                        </div>
                        <Link to={`/reservations/${res.reservationId}`} className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-2 py-1 rounded hover:bg-primary-50 transition">
                          View
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Today's Departures */}
            <div className="bg-surface border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border bg-warning-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <UserMinus size={16} className="text-warning-600" /> Today's Departures ({departures.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto max-h-80 p-2">
                {departures.length === 0 ? (
                  <p className="text-text-muted text-sm text-center py-8">No departures scheduled for today.</p>
                ) : (
                  <ul className="space-y-2">
                    {departures.map(res => (
                      <li key={res.reservationId} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border hover:border-warning-300 transition">
                        <div>
                          <p className="text-sm font-bold text-text">{res.guest?.fullName}</p>
                          <p className="text-xs text-text-muted">
                            Room {res.reservationRooms[0]?.room?.roomNumber || 'TBD'} • Bal: {res.balanceDue} GHS
                          </p>
                        </div>
                        <Link to={`/reservations/${res.reservationId}`} className="text-xs font-semibold text-warning-600 hover:text-warning-700 px-2 py-1 rounded hover:bg-warning-50 transition">
                          Check Out
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* 🌟 BOTTOM ROW: ALERTS & QUICK ACTIONS      */}
          {/* ========================================== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Housekeeping / Maintenance Alerts */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-text mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-danger-500" /> Housekeeping & Maintenance Alerts
              </h3>
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-success-600 font-semibold text-sm">
                  ✨ All rooms are clean and operational!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {alerts.map(room => {
                    const isDirty = room.housekeepingStatus === 'Dirty';
                    const isMaint = room.operationalStatus === 'Maintenance' || room.housekeepingStatus === 'OutOfService';
                    return (
                      <div key={room.roomId} className={`flex items-center justify-between p-3 rounded-lg border ${isMaint ? 'bg-danger-50 border-danger-200' : 'bg-warning-50 border-warning-200'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-bold ${isMaint ? 'text-danger-700' : 'text-warning-700'}`}>
                            {room.roomNumber}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isMaint ? 'bg-danger-100 text-danger-700' : 'bg-warning-100 text-warning-700'}`}>
                            {isMaint ? 'Out of Order' : 'Needs Cleaning'}
                          </span>
                        </div>
                        <Link to="/rooms" className="text-xs font-semibold text-text-muted hover:text-text transition">
                          Manage
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-sm flex flex-col">
              <h3 className="text-sm font-bold text-text mb-4 flex items-center gap-2">
                <LayoutGrid size={16} className="text-primary-500" /> Quick Actions
              </h3>
              <div className="space-y-3 flex-1">
                <QuickLink to="/availability" icon={Search} label="Check Availability" color="primary" />
                <QuickLink to="/payments" icon={CreditCard} label="Record Payment" color="success" />
                <QuickLink to="/rooms" icon={BedDouble} label="Manage Rooms" color="warning" />
                <QuickLink to="/reservations" icon={Calendar} label="All Reservations" color="secondary" />
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// REUSABLE COMPONENTS
// ==========================================

function OpCard({ icon: Icon, label, value, subtext, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    warning: 'bg-warning-50 text-warning-600',
    success: 'bg-success-50 text-success-600',
    danger: 'bg-danger-50 text-danger-600',
  };

  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</p>
        <h3 className="text-3xl font-bold text-text">{value}</h3>
        {subtext && <p className="text-xs text-text-muted mt-1.5 font-medium">{subtext}</p>}
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600 hover:bg-primary-100',
    secondary: 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200',
    success: 'bg-success-50 text-success-600 hover:bg-success-100',
    warning: 'bg-warning-50 text-warning-600 hover:bg-warning-100',
  };

  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 p-3 rounded-lg border border-border transition-all group ${colorMap[color]}`}
    >
      <Icon size={18} />
      <span className="text-sm font-semibold text-text flex-1">{label}</span>
      <ArrowRight size={16} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-text-muted" />
    </Link>
  );
}