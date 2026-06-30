import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReservations, createReservation, checkInReservation, checkOutReservation, cancelReservation } from '../api/reservations';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import { Search, Plus, CalendarDays, AlertCircle, LogIn, LogOut, XCircle, Filter } from 'lucide-react';

export default function ReservationsPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // 1. Fetch Reservations
  const { data, isLoading, error } = useQuery({
    queryKey: ['reservations', propertyId, statusFilter],
    queryFn: () => {
      const params = { propertyId, limit: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      return getReservations(params).then(res => res.data);
    },
    enabled: !!propertyId,
  });

  const reservations = data?.data || [];

  // 2. Mutations
  const createMutation = useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] }); // Refresh room availability
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
    },
  });

  // 3. Handlers
  const handleAction = (id, action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    actionMutation.mutate({ id, action });
  };

  // Filter by search (client-side for simplicity, or pass to API)
  const filteredReservations = reservations.filter(res => 
    res.guest?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    res.reservationRooms?.some(r => r.room?.roomNumber?.includes(search))
  );

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'Confirmed', label: 'Confirmed' },
    { id: 'CheckedIn', label: 'Checked In' },
    { id: 'CheckedOut', label: 'Checked Out' },
    { id: 'Cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Reservations</h1>
          <p className="text-text-muted text-sm mt-1">Manage bookings, check-ins, and check-outs.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> New Booking
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-2 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input
            type="text" placeholder="Search by guest name or room number..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
          />
        </div>
        <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
          {filters.map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                statusFilter === f.id ? 'bg-surface text-text shadow-sm border border-border' : 'text-text-muted hover:text-text'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-text-muted animate-pulse">Loading reservations...</div>
        ) : error ? (
          <div className="p-12 text-center text-danger-600 flex flex-col items-center gap-2">
            <AlertCircle size={24} /> <p className="font-semibold">Failed to load reservations</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
            <CalendarDays size={24} /> <p className="font-semibold">No reservations found</p>
          </div>
        ) : (
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
                {filteredReservations.map((res) => {
                  const rooms = res.reservationRooms?.map(r => r.room?.roomNumber).join(', ') || 'N/A';
                  const checkIn = new Date(res.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const checkOut = new Date(res.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  // Status Badges
                  let statusClass = 'bg-secondary-100 text-secondary-700';
                  if (res.status === 'Confirmed') statusClass = 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20';
                  if (res.status === 'CheckedIn') statusClass = 'bg-success-50 text-success-700 ring-1 ring-success-600/20';
                  if (res.status === 'CheckedOut') statusClass = 'bg-secondary-100 text-secondary-600';
                  if (res.status === 'Cancelled') statusClass = 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';

                  // Actions
                  let actions = null;
                  if (res.status === 'Confirmed') {
                    actions = (
                      <button onClick={() => handleAction(res.reservationId, 'checkin', 'Check in this guest?')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-success-600 text-text-inverted hover:bg-success-700 transition">
                        <LogIn size={14} /> Check In
                      </button>
                    );
                  } else if (res.status === 'CheckedIn') {
                    actions = (
                      <button onClick={() => handleAction(res.reservationId, 'checkout', 'Check out this guest?')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-text-inverted hover:bg-primary-700 transition">
                        <LogOut size={14} /> Check Out
                      </button>
                    );
                  }

                  if (res.status !== 'CheckedOut' && res.status !== 'Cancelled') {
                    actions = (
                      <div className="flex items-center justify-end gap-2">
                        {actions}
                        <button onClick={() => handleAction(res.reservationId, 'cancel', 'Cancel this reservation?')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition">
                          <XCircle size={14} /> Cancel
                        </button>
                      </div>
                    );
                  }

                  return (
                    <tr key={res.reservationId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-text-muted">#{res.reservationId}</p>
                        <p className="text-sm font-semibold text-text">{res.guest?.fullName}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-text font-medium">{rooms}</td>
                      <td className="px-6 py-4 text-sm text-text-muted">
                        {checkIn} <span className="mx-1">→</span> {checkOut}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-text text-right">
                        {parseFloat(res.totalAmount || 0).toFixed(2)} GHS
                      </td>
                      <td className="px-6 py-4 text-right">
                        {actions || <span className="text-xs text-text-muted">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <ReservationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isLoading}
      />
    </div>
  );
}