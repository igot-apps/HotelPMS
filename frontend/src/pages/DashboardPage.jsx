import { useQuery } from '@tanstack/react-query';
import { getDailySummary, getRecentReservations } from '../api/reports';
import { useAuthStore } from '../store/authStore';
import StatCard from '../components/ui/StatCard';
import { DollarSign, BedDouble, UserCheck, UserX, Loader2, AlertCircle } from 'lucide-react';
 import toast from 'react-hot-toast'; // Make sure to import this at the top!

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // 1. Fetch Daily Summary Stats
  const { data: summaryData, isLoading: isLoadingStats, error: statsError } = useQuery({
    queryKey: ['dailySummary', propertyId, today],
    queryFn: () => getDailySummary(propertyId, today).then(res => res.data.data),
    enabled: !!propertyId,
  });

  // 2. Fetch Recent Reservations
  const { data: reservationsData, isLoading: isLoadingRes } = useQuery({
    queryKey: ['recentReservations', propertyId],
    queryFn: () => getRecentReservations(propertyId).then(res => res.data.data),
    enabled: !!propertyId,
  });

  // Helper to safely format Prisma decimal strings
  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Dashboard Overview</h1>
        <p className="text-text-muted">Here is what's happening at {user?.tenantName || 'your property'} today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoadingStats ? (
          // Loading Skeletons
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-surface p-6 rounded-xl border border-border animate-pulse">
              <div className="h-4 bg-secondary-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-secondary-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-secondary-100 rounded w-1/3"></div>
            </div>
          ))
        ) : statsError ? (
          <div className="col-span-full bg-danger-50 border border-danger-100 text-danger-600 p-4 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} /> Failed to load dashboard statistics.
          </div>
        ) : (
          <>
            <StatCard 
              title="Total Revenue" 
              value={`${formatCurrency(summaryData?.totalRevenue)} GHS`} 
              subtitle="Today's collected payments" 
              icon={DollarSign} 
            />
            <StatCard 
              title="Occupancy Rate" 
              value={`${parseFloat(summaryData?.occupancyRate || 0).toFixed(0)}%`} 
              subtitle={`${summaryData?.currentOccupancy || 0} of ${summaryData?.totalRooms || 0} rooms`} 
              icon={BedDouble} 
            />
            <StatCard 
              title="Check-ins Today" 
              value={summaryData?.checkIns || 0} 
              subtitle="Expected arrivals" 
              icon={UserCheck} 
            />
            <StatCard 
              title="Check-outs Today" 
              value={summaryData?.checkOuts || 0} 
              subtitle="Expected departures" 
              icon={UserX} 
            />
          </>
        )}
      </div>

      {/* Recent Reservations Table */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Recent Reservations</h2>
          <p className="text-sm text-text-muted">Latest booking activity for your property.</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50 text-text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-semibold">Guest</th>
                <th className="px-6 py-3 font-semibold">Room(s)</th>
                <th className="px-6 py-3 font-semibold">Dates</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoadingRes ? (
                Array(3).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan="5" className="px-6 py-4"><div className="h-4 bg-secondary-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : !reservationsData || reservationsData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-text-muted">
                    No recent reservations found.
                  </td>
                </tr>
              ) : (
                reservationsData.map((res) => {
                  const rooms = res.reservationRooms?.map(r => r.room?.roomNumber).join(', ') || 'N/A';
                  const checkIn = new Date(res.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const checkOut = new Date(res.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  // Status Badge Colors
                  let statusClass = 'bg-secondary-100 text-secondary-700';
                  if (res.status === 'CheckedIn') statusClass = 'bg-success-100 text-success-700';
                  if (res.status === 'CheckedOut') statusClass = 'bg-secondary-100 text-secondary-600';
                  if (res.status === 'Cancelled') statusClass = 'bg-danger-100 text-danger-700';

                  return (
                    <tr key={res.reservationId} className="hover:bg-secondary-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-text">{res.guest?.fullName}</td>
                      <td className="px-6 py-4 text-sm text-text-muted">{rooms}</td>
                      <td className="px-6 py-4 text-sm text-text-muted">{checkIn} - {checkOut}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-text text-right">
                        {formatCurrency(res.totalAmount)} GHS
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}