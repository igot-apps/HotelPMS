import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getReservations, createReservation, checkInReservation, checkOutReservation, cancelReservation } from '../api/reservations';
import { recordPayment } from '../api/payments';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import { Search, Plus, CalendarDays, AlertCircle, LogIn, LogOut, XCircle, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';

export default function ReservationsPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');

  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined || value === 'all') newParams.delete(key);
      else newParams.set(key, String(value));
    });
    setSearchParams(newParams, { replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) updateParams({ search: localSearch, page: 1 });
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['reservations', propertyId, status, page, limit, search, fromDate, toDate],
    queryFn: () => {
      const params = { propertyId, limit, page };
      if (status !== 'all') params.status = status;
      if (search) params.search = search;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      return getReservations(params).then(res => res.data);
    },
    placeholderData: keepPreviousData,
    enabled: !!propertyId,
  });

  const reservations = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const totalPages = Math.ceil(pagination.total / limit);
  const startItem = pagination.total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, pagination.total);

  const filteredReservations = reservations.filter(res => 
    res.guest?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    res.reservationRooms?.some(r => r.room?.roomNumber?.toLowerCase().includes(search.toLowerCase()))
  );

  // 🛡️ BULLETPROOF TWO-STEP MUTATION
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      // 1. Create the reservation (We send amountPaid: 0 to prevent double counting)
      const resResponse = await createReservation(payload);
      const newReservation = resResponse.data.data;

      // 2. If there was an initial payment, record it separately via POST /payments
      if (payload.initialPayment > 0.01) {
        const paymentPayload = {
          reservationId: newReservation.reservationId,
          amount: payload.initialPayment,
          paymentMethod: payload.paymentMethod,
          propertyId: payload.propertyId,
          gatewayReference: payload.gatewayReference || null,
          notes: 'Initial payment for reservation'
        };
        
        try {
          await recordPayment(paymentPayload);
        } catch (err) {
          console.error("❌ Initial payment recording failed:", err);
          // We catch the error so the reservation still saves, but the global toast will show the error
        }
      }
      
      return resResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] }); 
      queryClient.invalidateQueries({ queryKey: ['payments'] }); 
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] }); // Refresh dashboard alerts
      queryClient.invalidateQueries({ queryKey: ['dashboardUpcoming'] });
      setIsModalOpen(false);
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }) => {
      if (action === 'checkin') return checkInReservation(id);
      if (action === 'checkout') return checkOutReservation(id);
      if (action === 'cancel') return cancelReservation(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] });
    },
  });

  const handleAction = (id, action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    actionMutation.mutate({ id, action });
  };

  const handleFilterChange = (key, value) => updateParams({ [key]: value, page: 1 });
  const clearFilters = () => { updateParams({ search: '', status: '', fromDate: '', toDate: '', page: 1 }); setLocalSearch(''); };
  const hasActiveFilters = status !== 'all' || fromDate || toDate;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Reservations</h1>
          <p className="text-text-muted text-sm mt-1">Total matching: <span className="font-bold text-text">{pagination.total}</span></p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> New Booking
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input type="text" placeholder="Search guest or room..." value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
          </div>
          <select value={status} onChange={(e) => handleFilterChange('status', e.target.value)} className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20">
            <option value="all">All Statuses</option><option value="Confirmed">Confirmed</option><option value="CheckedIn">Checked In</option><option value="CheckedOut">Checked Out</option><option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Check-in From</label>
            <input type="date" value={fromDate} onChange={(e) => handleFilterChange('fromDate', e.target.value)} className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Check-out To</label>
            <input type="date" value={toDate} onChange={(e) => handleFilterChange('toDate', e.target.value)} className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 hover:text-danger-700 transition"><X size={14} /> Clear Filters</button>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">ID / Guest</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Room(s)</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Dates</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Amount</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted animate-pulse">Loading...</td></tr>
              ) : filteredReservations.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><CalendarDays size={24} /> <p className="font-semibold">No reservations found</p></td></tr>
              ) : (
                filteredReservations.map((res) => {
                  const rooms = res.reservationRooms?.map(r => r.room?.roomNumber).join(', ') || 'N/A';
                  const checkIn = new Date(res.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const checkOut = new Date(res.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  let statusClass = 'bg-secondary-100 text-secondary-700';
                  if (res.status === 'Confirmed') statusClass = 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20';
                  if (res.status === 'CheckedIn') statusClass = 'bg-success-50 text-success-700 ring-1 ring-success-600/20';
                  if (res.status === 'CheckedOut') statusClass = 'bg-secondary-100 text-secondary-600';
                  if (res.status === 'Cancelled') statusClass = 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';

                  let actions = null;
                  if (res.status === 'Confirmed') actions = (<button onClick={() => handleAction(res.reservationId, 'checkin', 'Check in this guest?')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-success-600 text-text-inverted hover:bg-success-700 transition"><LogIn size={14} /> Check In</button>);
                  else if (res.status === 'CheckedIn') actions = (<button onClick={() => handleAction(res.reservationId, 'checkout', 'Check out this guest?')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-text-inverted hover:bg-primary-700 transition"><LogOut size={14} /> Check Out</button>);

                  if (res.status !== 'CheckedOut' && res.status !== 'Cancelled') {
                    actions = (
                      <div className="flex items-center justify-end gap-2">
                        {actions}
                        <button onClick={() => handleAction(res.reservationId, 'cancel', 'Cancel this reservation?')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"><XCircle size={14} /> Cancel</button>
                      </div>
                    );
                  }

                  return (
                    <tr key={res.reservationId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                      <td className="px-6 py-4"><p className="text-xs font-bold text-text-muted">#{res.reservationId}</p><p className="text-sm font-semibold text-text">{res.guest?.fullName}</p></td>
                      <td className="px-6 py-4 text-sm text-text font-medium">{rooms}</td>
                      <td className="px-6 py-4 text-sm text-text-muted">{checkIn} <span className="mx-1">→</span> {checkOut}</td>
                      <td className="px-6 py-4"><span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>{res.status}</span></td>
                      <td className="px-6 py-4 text-sm font-bold text-text text-right">{parseFloat(res.totalAmount || 0).toFixed(2)} GHS</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/reservations/${res.reservationId}`} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="View Details"><Eye size={16} /></Link>
                          {actions || <span className="text-xs text-text-muted">-</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-border bg-secondary-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-text-muted">Showing <span className="font-semibold text-text">{startItem}</span> to <span className="font-semibold text-text">{endItem}</span> of <span className="font-semibold text-text">{pagination.total}</span></p>
            <select value={limit} onChange={(e) => updateParams({ limit: e.target.value, page: 1 })} className="text-sm border border-border rounded-lg px-2 py-1 bg-surface text-text outline-none focus:ring-2 focus:ring-primary-500/20">
              <option value="10">10 / page</option><option value="25">25 / page</option><option value="50">50 / page</option><option value="100">100 / page</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ page: 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => updateParams({ page: page - 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"><ChevronLeft size={16} /> Prev</button>
            <span className="px-3 py-1 text-sm font-semibold text-text bg-background border border-border rounded-lg min-w-[100px] text-center">Page {page} of {totalPages || 1}</span>
            <button onClick={() => updateParams({ page: page + 1 })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1">Next <ChevronRight size={16} /></button>
            <button onClick={() => updateParams({ page: totalPages })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      </div>

      <ReservationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={(data) => createMutation.mutate(data)} isLoading={createMutation.isPending} />
    </div>
  );
}