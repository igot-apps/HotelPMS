import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFullDashboardReport } from '../api/reports';
import { getProperties } from '../api/properties';
import { 
  TrendingUp, TrendingDown, DollarSign, BedDouble, Percent, 
  Calendar, BarChart3, PieChart, Loader2, Building2, Wallet, Activity
} from 'lucide-react';

export default function ReportsPage() {
  // Default to Current Month
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().split('T')[0];
  });

  const [propertyId, setPropertyId] = useState('');

  // Fetch Properties for the filter dropdown
  const { data: propsData } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties().then(res => res.data.data || res.data || []),
  });
  const properties = propsData || [];

  // Fetch the Master Report
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardReport', startDate, endDate, propertyId],
    queryFn: () => {
      const params = { startDate, endDate };
      if (propertyId) params.propertyId = propertyId;
      return getFullDashboardReport(params).then(res => res.data.data);
    },
  });

  const summary = data?.summary || {};
  const timeSeries = data?.timeSeries || [];
  const categories = data?.categories || { byMethod: [], byRoomType: [] };

  // Chart Calculations
  const maxRev = Math.max(...timeSeries.map(d => d.total), 1);
  const maxMethod = Math.max(...categories.byMethod.map(m => m.total), 1);
  const maxRoomType = Math.max(...categories.byRoomType.map(r => r.total), 1);

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <BarChart3 size={24} className="text-primary-500" /> Analytics & Reports
          </h1>
          <p className="text-text-muted text-sm mt-1">Enterprise KPIs, revenue trends, and operational performance.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-surface p-3 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-text-muted" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:ring-2 focus:ring-primary-500/20 outline-none" />
            <span className="text-text-muted text-sm">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:ring-2 focus:ring-primary-500/20 outline-none" />
          </div>
          <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:ring-2 focus:ring-primary-500/20 outline-none min-w-[150px]">
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.propertyId} value={p.propertyId}>{p.propertyName}</option>)}
          </select>
        </div>
      </div>

      {/* Loading / Error States */}
      {isLoading && (
        <div className="bg-surface border border-border rounded-xl p-12 flex flex-col items-center justify-center gap-3 text-text-muted">
          <Loader2 className="animate-spin text-primary-500" size={32} />
          <p className="font-semibold">Crunching the numbers...</p>
        </div>
      )}

      {isError && (
        <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-xl p-6 text-center font-semibold">
          Failed to load reports data. Please try again.
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* 🌟 KPI CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard icon={DollarSign} label="Total Revenue" value={`${summary.currentRevenue?.toFixed(2) || 0} GHS`} growth={summary.revenueGrowth} color="primary" />
            <KpiCard icon={Activity} label="Transactions" value={summary.totalTransactions || 0} color="secondary" />
            <KpiCard icon={Percent} label="Occupancy Rate" value={`${summary.occupancyRate || 0}%`} subtext={`${summary.actualOccupiedNights || 0} / ${summary.totalAvailableNights || 0} nights`} color="success" />
            <KpiCard icon={BedDouble} label="ADR" value={`${summary.adr?.toFixed(2) || 0} GHS`} subtext="Avg. Daily Rate" color="warning" />
            <KpiCard icon={Wallet} label="RevPAR" value={`${summary.revpar?.toFixed(2) || 0} GHS`} subtext="Rev. Per Avail. Room" color="info" />
          </div>

          {/* 🌟 CHARTS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Time Series Bar Chart (Spans 2 columns) */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-text mb-6 flex items-center gap-2">
                <BarChart3 size={16} className="text-primary-500" /> Daily Revenue Trend
              </h3>
              <div className="flex items-end gap-1.5 h-48 w-full overflow-x-auto pb-2">
                {timeSeries.map((day, idx) => {
                  const heightPercent = (day.total / maxRev) * 100;
                  const isToday = day.date === new Date().toISOString().split('T')[0];
                  return (
                    <div key={idx} className="flex-1 min-w-[12px] flex flex-col items-center group relative h-full justify-end">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block bg-text text-surface text-xs font-bold py-1 px-2 rounded shadow-lg z-10 whitespace-nowrap">
                        {day.date}: {day.total.toFixed(2)} GHS
                      </div>
                      <div 
                        className={`w-full rounded-t-md transition-all ${isToday ? 'bg-primary-600' : 'bg-primary-400 hover:bg-primary-500'}`} 
                        style={{ height: `${Math.max(heightPercent, day.total > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-text-muted font-medium">
                <span>{timeSeries[0]?.date}</span>
                <span>{timeSeries[Math.floor(timeSeries.length / 2)]?.date}</span>
                <span>{timeSeries[timeSeries.length - 1]?.date}</span>
              </div>
            </div>

            {/* Payment Methods Breakdown */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-text mb-6 flex items-center gap-2">
                <PieChart size={16} className="text-success-500" /> Revenue by Payment Method
              </h3>
              <div className="space-y-4">
                {categories.byMethod.length === 0 ? (
                  <p className="text-text-muted text-sm text-center py-8">No payment data for this period.</p>
                ) : (
                  categories.byMethod.map((m, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-semibold text-text">{m.method}</span>
                        <span className="text-text-muted">{m.total.toFixed(2)} GHS</span>
                      </div>
                      <div className="w-full bg-secondary-100 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full ${m.method === 'Cash' ? 'bg-success-500' : m.method === 'Card' ? 'bg-primary-500' : 'bg-warning-500'}`} 
                          style={{ width: `${(m.total / maxMethod) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 🌟 ROOM TYPE BREAKDOWN */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-text mb-6 flex items-center gap-2">
              <Building2 size={16} className="text-warning-500" /> Revenue by Room Type
            </h3>
            {categories.byRoomType.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">No room revenue recorded for this period. (Ensure reservations have an agreed price per night).</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.byRoomType.map((r, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-semibold text-text">{r.typeName}</span>
                      <span className="text-text-muted">{r.total.toFixed(2)} GHS</span>
                    </div>
                    <div className="w-full bg-secondary-100 rounded-full h-2.5">
                      <div 
                        className="h-2.5 rounded-full bg-warning-500" 
                        style={{ width: `${(r.total / maxRoomType) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 🌟 Reusable KPI Card Component
function KpiCard({ icon: Icon, label, value, growth, subtext, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    secondary: 'bg-secondary-100 text-secondary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    info: 'bg-blue-50 text-blue-600',
  };

  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        {growth !== undefined && growth !== 0 && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${growth > 0 ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
            {growth > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {growth > 0 ? '+' : ''}{growth}%
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-text">{value}</h3>
      {subtext && <p className="text-xs text-text-muted mt-1">{subtext}</p>}
    </div>
  );
}