import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  getOccupancyReport, getRevenueReport, getReservationReport, 
  getGuestReport, getMonthlySummary 
} from '../api/reports';
import { useAuthStore } from '../store/authStore';
import { 
  Calendar, TrendingUp, Users, Loader2, DollarSign, BedDouble, 
  UserPlus, RefreshCw, BarChart3 
} from 'lucide-react';

export default function ReportsPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  // Default Date Range: Current Month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Month/Year picker for the Trends tab
  const [trendMonth, setTrendMonth] = useState(today.getMonth() + 1);
  const [trendYear, setTrendYear] = useState(today.getFullYear());

  // 1. Fetch All Reports Concurrently
  const { data: occData, isLoading: isOccLoading } = useQuery({
    queryKey: ['reportOccupancy', propertyId, fromDate, toDate],
    queryFn: () => getOccupancyReport(propertyId, fromDate, toDate).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const { data: revData, isLoading: isRevLoading } = useQuery({
    queryKey: ['reportRevenue', propertyId, fromDate, toDate],
    queryFn: () => getRevenueReport(propertyId, fromDate, toDate).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const { data: resData, isLoading: isResLoading } = useQuery({
    queryKey: ['reportReservations', propertyId, fromDate, toDate],
    queryFn: () => getReservationReport(propertyId, fromDate, toDate).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const { data: guestData, isLoading: isGuestLoading } = useQuery({
    queryKey: ['reportGuests', propertyId, fromDate, toDate],
    queryFn: () => getGuestReport(propertyId, fromDate, toDate).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const { data: monthlyData, isLoading: isMonthlyLoading } = useQuery({
    queryKey: ['reportMonthly', propertyId, trendMonth, trendYear],
    queryFn: () => getMonthlySummary(propertyId, trendMonth, trendYear).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const isLoading = isOccLoading || isRevLoading || isResLoading || isGuestLoading;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'financials', label: 'Financials', icon: DollarSign },
    { id: 'operations', label: 'Operations', icon: Users },
    { id: 'trends', label: 'Monthly Trends', icon: BarChart3 },
  ];

  // Helper to safely format Prisma decimals
  const fmt = (val) => parseFloat(val || 0).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header & Date Picker */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Reports & Analytics</h1>
          <p className="text-text-muted text-sm mt-1">Analyze performance and generate insights.</p>
        </div>
        
        {/* Date Range Selector */}
        <div className="flex items-center gap-2 bg-surface p-2 rounded-xl border border-border shadow-sm">
          <Calendar size={16} className="text-text-muted ml-2" />
          <input 
            type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="bg-transparent text-sm text-text border-none focus:ring-0 outline-none"
          />
          <span className="text-text-muted text-sm">to</span>
          <input 
            type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="bg-transparent text-sm text-text border-none focus:ring-0 outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface p-1 rounded-xl border border-border shadow-sm w-fit overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-primary-600 text-text-inverted shadow-md shadow-primary-600/20' 
                : 'text-text-muted hover:bg-secondary-50 hover:text-text'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 bg-surface rounded-xl border border-border">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={DollarSign} label="Total Revenue" value={`${fmt(revData?.totalRevenue)} GHS`} color="primary" />
                <KpiCard icon={BedDouble} label="Occupancy Rate" value={`${fmt(occData?.occupancyRate)}%`} color="success" />
                <KpiCard icon={Calendar} label="Total Reservations" value={resData?.totalReservations || 0} color="warning" />
                <KpiCard icon={Users} label="Total Guests" value={guestData?.totalGuests || 0} color="secondary" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ReportCard title="Occupancy Breakdown" subtitle={`${occData?.occupiedRoomNights || 0} of ${occData?.totalRoomNights || 0} Room Nights`}>
                  <div className="space-y-4">
                    <ProgressBar label="Occupied" value={occData?.occupiedRoomNights || 0} max={occData?.totalRoomNights || 1} color="success" />
                    <ProgressBar label="Available" value={(occData?.totalRoomNights || 0) - (occData?.occupiedRoomNights || 0)} max={occData?.totalRoomNights || 1} color="secondary" />
                  </div>
                </ReportCard>

                <ReportCard title="Reservation Sources">
                  <BarChart data={resData?.bySource} valueKey="count" labelKey="source" color="primary" />
                </ReportCard>
              </div>
            </div>
          )}

          {/* TAB 2: FINANCIALS */}
          {activeTab === 'financials' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ReportCard title="Revenue by Payment Method">
                <BarChart data={revData?.byMethod} valueKey="total" labelKey="method" color="success" isCurrency />
              </ReportCard>
              <ReportCard title="Revenue by Room Type">
                <BarChart data={revData?.byRoomType} valueKey="revenue" labelKey="roomTypeName" color="warning" isCurrency />
              </ReportCard>
            </div>
          )}

          {/* TAB 3: OPERATIONS */}
          {activeTab === 'operations' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ReportCard title="Reservation Status Breakdown">
                <BarChart data={resData?.byStatus} valueKey="count" labelKey="status" color="primary" />
              </ReportCard>
              <ReportCard title="Guest Insights">
                <div className="space-y-3">
                  <DataRow icon={UserPlus} label="New Guests" value={guestData?.newGuests || 0} />
                  <DataRow icon={RefreshCw} label="Returning Guests" value={guestData?.returningGuests || 0} />
                  <DataRow label="Returning Rate" value={`${fmt(guestData?.returningRate)}%`} />
                  <DataRow label="Total Spent (Period)" value={`${fmt(guestData?.totalSpent)} GHS`} />
                  <DataRow label="Avg Spend / Guest" value={`${fmt(guestData?.averageSpent)} GHS`} />
                  <DataRow label="Avg Length of Stay" value={`${fmt(resData?.averageLengthOfStay)} Nights`} />
                </div>
              </ReportCard>
            </div>
          )}

          {/* TAB 4: MONTHLY TRENDS (Using the dailyData array) */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              {/* Month/Year Picker */}
              <div className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-border shadow-sm w-fit">
                <span className="text-sm font-semibold text-text">Viewing:</span>
                <select 
                  value={trendMonth} onChange={(e) => setTrendMonth(parseInt(e.target.value))}
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
                <input 
                  type="number" value={trendYear} onChange={(e) => setTrendYear(parseInt(e.target.value))}
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text w-24 outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <ReportCard title={`Daily Revenue Trend - ${monthlyData?.month || ''}`} subtitle={`${monthlyData?.days || 0} Days in Month`}>
                {isMonthlyLoading ? (
                  <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-primary-600" /></div>
                ) : (
                  <DailyTrendChart dailyData={monthlyData?.dailyData || []} />
                )}
              </ReportCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==========================================
// REUSABLE UI COMPONENTS
// ==========================================

function KpiCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    secondary: 'bg-secondary-100 text-secondary-600',
  };

  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      </div>
      <h3 className="text-2xl font-bold text-text">{value}</h3>
    </div>
  );
}

function ReportCard({ title, subtitle, children }) {
  return (
    <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-text">{title}</h3>
        {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ label, value, max, color }) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const colorMap = { success: 'bg-success-500', secondary: 'bg-secondary-400', primary: 'bg-primary-500' };
  
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-text mb-1.5">
        <span>{label}</span>
        <span>{value} Nights ({percent.toFixed(1)}%)</span>
      </div>
      <div className="h-3 bg-secondary-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color]} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

function DataRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        {Icon && <Icon size={14} className="text-text-muted" />}
        <span>{label}</span>
      </div>
      <span className="text-sm font-bold text-text">{value}</span>
    </div>
  );
}

// Pure CSS Bar Chart
function BarChart({ data, valueKey, labelKey, color = 'primary', isCurrency = false }) {
  if (!data || data.length === 0) {
    return <p className="text-text-muted text-sm text-center py-8">No data available for this period.</p>;
  }

  const maxVal = Math.max(...data.map(item => parseFloat(item[valueKey] || 0)));
  const colorMap = {
    primary: 'bg-primary-500', success: 'bg-success-500',
    warning: 'bg-warning-500', danger: 'bg-danger-500', secondary: 'bg-secondary-500',
  };

  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const val = parseFloat(item[valueKey] || 0);
        const percent = maxVal > 0 ? (val / maxVal) * 100 : 0;
        const label = item[labelKey] || 'Unknown';
        const displayVal = isCurrency ? `${val.toFixed(2)} GHS` : val;

        return (
          <div key={index} className="flex items-center gap-3">
            <span className="w-28 text-xs font-medium text-text text-right truncate" title={label}>
              {label}
            </span>
            <div className="flex-1 h-6 bg-secondary-100 rounded-md overflow-hidden relative">
              <div 
                className={`h-full ${colorMap[color] || 'bg-primary-500'} rounded-md transition-all duration-500 flex items-center px-2`}
                style={{ width: `${Math.max(percent, 2)}%` }}
              >
                {percent > 15 && (
                  <span className="text-[10px] font-bold text-text-inverted whitespace-nowrap">
                    {percent.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <span className="w-24 text-xs font-semibold text-text-muted text-right">
              {displayVal}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Daily Trend Visualizer (Flexbox Bars)
function DailyTrendChart({ dailyData }) {
  if (!dailyData || dailyData.length === 0) return <p className="text-center text-text-muted py-8">No daily data available.</p>;

  const maxRevenue = Math.max(...dailyData.map(d => parseFloat(d.totalRevenue || 0)), 1);

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-end gap-1 h-48 min-w-[600px]">
        {dailyData.map((day, index) => {
          const revenue = parseFloat(day.totalRevenue || 0);
          const heightPercent = (revenue / maxRevenue) * 100;
          const dateObj = new Date(day.date);
          const dayNum = dateObj.getDate();

          return (
            <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-secondary-900 text-text-inverted text-xs rounded px-2 py-1 whitespace-nowrap z-10 shadow-lg">
                <p className="font-bold">{revenue.toFixed(2)} GHS</p>
                <p className="opacity-70">{dateObj.toLocaleDateString()}</p>
              </div>
              
              {/* Bar */}
              <div 
                className="w-full bg-primary-500 hover:bg-primary-600 rounded-t transition-all duration-200 cursor-pointer"
                style={{ height: `${Math.max(heightPercent, revenue > 0 ? 2 : 0)}%` }}
              ></div>
              
              {/* X-Axis Label (Show every 5th day to avoid clutter) */}
              <span className="text-[10px] text-text-muted mt-1">
                {dayNum % 5 === 0 || dayNum === 1 ? dayNum : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}