import { useState, useEffect, useRef, Fragment } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getReservations, createReservation, cancelReservation, updateReservationRoomStatus, extendReservationRoom } from '../api/reservations';
import { recordPayment } from '../api/payments';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import {
  Search, Plus, CalendarDays, AlertCircle, LogIn, LogOut, XCircle,
  ChevronLeft, ChevronRight, Eye, X, Check,
  ChevronDown, ChevronUp, BedDouble, Loader2, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────
// Lightweight confirmation modal with optional input field
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, isLoading = false, onConfirm, onCancel, inputLabel, inputValue, onInputChange }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onCancel(); }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-sm p-5">
        <h3 id="confirm-dialog-title" className="text-base font-bold text-text mb-1.5">{title}</h3>
        <p className="text-sm text-text-muted mb-4 whitespace-pre-line">{message}</p>
        
        {/* Optional Input Field for Occupant Name */}
        {inputLabel && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-text-muted mb-1.5">{inputLabel}</label>
            <input
              type="text"
              value={inputValue || ''}
              onChange={(e) => onInputChange && onInputChange(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              autoFocus
            />
          </div>
        )}
        
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-border text-text hover:bg-secondary-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg text-text-inverted transition disabled:opacity-60 ${
              danger ? 'bg-danger-600 hover:bg-danger-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');
  const [createdReservation, setCreatedReservation] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);

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

  const [isSearchPending, setIsSearchPending] = useState(false);
  useEffect(() => {
    if (localSearch === search) return;
    setIsSearchPending(true);
    const timer = setTimeout(() => {
      updateParams({ search: localSearch, page: 1 });
      setIsSearchPending(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  useEffect(() => {
    setExpandedId(null);
  }, [page, search, status, fromDate, toDate]);

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useQuery({
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
  const hasActiveFilters = status !== 'all' || !!fromDate || !!toDate || !!search;

  // 🌟 Room action mutation - now accepts occupantName
  const roomActionMutation = useMutation({
    mutationFn: ({ id, status, occupantName }) => {
      const data = { status };
      if (occupantName !== undefined) data.occupantName = occupantName;
      return updateReservationRoomStatus(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] });
      toast.success('Room status updated');
      setPendingConfirm(null);
    },
    onError: (err) => {
      toast.dismiss();
      toast.error(err.response?.data?.message || 'Failed to update room status');
      setPendingConfirm(null);
    },
  });

  // 🌟 NEW: Extend stay mutation
  const extendStayMutation = useMutation({
    mutationFn: ({ id, newCheckOutDate }) => extendReservationRoom(id, newCheckOutDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Stay extended successfully!');
      setPendingConfirm(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to extend stay');
      setPendingConfirm(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const resResponse = await createReservation(payload);
      const newReservation = resResponse.data.data;
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
          console.error('Initial payment recording failed:', err);
          toast.error('Reservation created, but the initial payment failed to record. Please add it manually.');
        }
      }
      return resResponse;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardUpcoming'] });
      setCreatedReservation(response.data.data);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to create reservation');
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }) => {
      if (action === 'cancel') return cancelReservation(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] });
      toast.success('Reservation cancelled');
      setPendingConfirm(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Action failed — please try again');
      setPendingConfirm(null);
    },
  });

  const askReservationAction = (id, action, title, message, opts = {}) => {
    setPendingConfirm({ kind: 'reservation', id, action, title, message, ...opts });
  };

  const askRoomAction = (reservationRoomId, roomStatus, title, message, opts = {}) => {
    setPendingConfirm({ kind: 'room', id: reservationRoomId, status: roomStatus, title, message, ...opts });
  };

  // 🌟 Handle confirm - now passes occupantName for check-ins and handles extend
  const handleConfirm = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'reservation') {
      actionMutation.mutate({ id: pendingConfirm.id, action: pendingConfirm.action });
    } else {
      const payload = { 
        id: pendingConfirm.id, 
        status: pendingConfirm.status 
      };
      
      if (pendingConfirm.status === 'CheckedIn' && pendingConfirm.inputValue) {
        payload.occupantName = pendingConfirm.inputValue;
      }
      
      if (pendingConfirm.status === 'extend' && pendingConfirm.newCheckOutDate) {
        extendStayMutation.mutate({ 
          id: pendingConfirm.id, 
          newCheckOutDate: pendingConfirm.newCheckOutDate 
        });
        return;
      }
      
      roomActionMutation.mutate(payload);
    }
  };

  const isConfirmLoading =
    (pendingConfirm?.kind === 'reservation' && actionMutation.isPending) ||
    (pendingConfirm?.kind === 'room' && roomActionMutation.isPending) ||
    (pendingConfirm?.kind === 'room' && extendStayMutation.isPending);

  const handleFilterChange = (key, value) => updateParams({ [key]: value, page: 1 });
  const clearFilters = () => { updateParams({ search: '', status: '', fromDate: '', toDate: '', page: 1 }); setLocalSearch(''); };

  const activeRoomActionId = roomActionMutation.isPending ? roomActionMutation.variables?.id : null;

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

      {/* Filters UI */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Search guest or room..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
            {isSearchPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" size={16} aria-label="Searching" />
            )}
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

      {/* TABLE */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <th className="w-10 px-2 py-3"></th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">ID / Guest</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Room(s)</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Dates</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Payment</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={isPlaceholderData ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
              {isLoading ? (
                <tr><td colSpan="7" className="p-12 text-center text-text-muted"><Loader2 className="mx-auto mb-2 animate-spin" size={22} /> Loading...</td></tr>
              ) : isError ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-danger-600">
                      <AlertCircle size={24} />
                      <p className="font-semibold">Couldn't load reservations</p>
                      <p className="text-xs text-text-muted">{error?.response?.data?.message || error?.message || 'Something went wrong'}</p>
                      <button onClick={() => refetch()} className="mt-1 text-xs font-semibold text-primary-600 hover:underline">Try again</button>
                    </div>
                  </td>
                </tr>
              ) : reservations.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center text-text-muted">
                    <div className="flex flex-col items-center gap-2">
                      <CalendarDays size={24} />
                      <p className="font-semibold">No reservations found</p>
                      {hasActiveFilters ? (
                        <button onClick={clearFilters} className="text-xs font-semibold text-primary-600 hover:underline">
                          Clear filters and try again
                        </button>
                      ) : (
                        <p className="text-xs">New bookings will show up here</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                reservations.map((res) => {
                  const rooms = res.reservationRooms?.map(r => r.room?.roomNumber).join(', ') || 'N/A';
                  const checkIn = new Date(res.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const checkOut = new Date(res.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                  let statusClass = 'bg-secondary-100 text-secondary-700';
                  if (res.status === 'Confirmed') statusClass = 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20';
                  if (res.status === 'CheckedIn') statusClass = 'bg-success-50 text-success-700 ring-1 ring-success-600/20';
                  if (res.status === 'CheckedOut') statusClass = 'bg-secondary-100 text-secondary-600';
                  if (res.status === 'Cancelled') statusClass = 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';

                  const isExpanded = expandedId === res.reservationId;

                  let actions = null;
                  if (res.status === 'Confirmed') {
                    actions = (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : res.reservationId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-success-600 text-text-inverted hover:bg-success-700 transition"
                      >
                        <LogIn size={14} /> Check In
                      </button>
                    );
                  } else if (res.status === 'CheckedIn') {
                    actions = (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : res.reservationId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-text-inverted hover:bg-primary-700 transition"
                      >
                        <LogOut size={14} /> Check Out
                      </button>
                    );
                  }

                  if (res.status !== 'CheckedOut' && res.status !== 'Cancelled') {
                    actions = (
                      <div className="flex items-center justify-end gap-2">
                        {actions}
                        <button
                          onClick={() => askReservationAction(
                            res.reservationId, 'cancel',
                            'Cancel reservation?',
                            `This will cancel reservation #${res.reservationId}. This can't be undone from here.`,
                            { danger: true, confirmLabel: 'Cancel Reservation' },
                          )}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"
                        >
                          <XCircle size={14} /> Cancel
                        </button>
                      </div>
                    );
                  }

                  const balanceDue = parseFloat(res.balanceDue || 0);
                  const hasBalance = balanceDue > 0.01;

                  return (
                    <Fragment key={res.reservationId}>
                      <tr className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                        <td className="px-2 py-4">
                          {res.reservationRooms?.length > 0 && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : res.reservationId)}
                              className="p-1.5 rounded-lg hover:bg-secondary-100 text-text-muted transition"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? `Collapse rooms for reservation ${res.reservationId}` : `Expand rooms for reservation ${res.reservationId}`}
                            >
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-text-muted">#{res.reservationId}</p>
                          <p className="text-sm font-semibold text-text">
                            {res.platformGuest?.fullName || res.propertyGuest?.fullName || 'N/A'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-text font-medium">{rooms}</td>
                        <td className="px-6 py-4 text-sm text-text-muted">{checkIn} <span className="mx-1">→</span> {checkOut}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>{res.status}</span>
                            {res.status === 'Cancelled' && res.refundStatus === 'Pending' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-warning-50 text-warning-700 border border-warning-200"><AlertCircle size={12} /> Refund Due: {parseFloat(res.refundDue || 0).toFixed(2)} GHS</span>
                            )}
                            {res.status === 'Cancelled' && res.refundStatus === 'Processed' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-success-50 text-success-700 border border-success-200"><Check size={12} /> Refunded</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-sm font-bold text-text">{parseFloat(res.totalAmount || 0).toFixed(2)} GHS</p>
                          {hasBalance ? (
                            <span className="inline-block text-xs font-bold text-danger-600 bg-danger-50 px-2 py-0.5 rounded mt-1">Due: {balanceDue.toFixed(2)} GHS</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-success-600 bg-success-50 px-2 py-0.5 rounded mt-1"><Check size={10} /> Paid</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/reservations/${res.reservationId}`} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" aria-label={`View details for reservation ${res.reservationId}`}><Eye size={16} /></Link>
                            {actions || <span className="text-xs text-text-muted">-</span>}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-secondary-50/30">
                          <td colSpan="7" className="p-6 border-b border-border">
                            <div className="flex items-center gap-2 mb-4">
                              <BedDouble size={18} className="text-primary-600" />
                              <h4 className="text-sm font-bold text-text uppercase tracking-wider">Individual Room Assignments</h4>
                              <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-semibold">{res.reservationRooms.length} Rooms</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {res.reservationRooms.map((rr) => {
                                const roomStatus = rr.status || 'Reserved';
                                const isThisRoomBusy = activeRoomActionId === rr.reservationRoomId;
                                let roomActionBtn = null;

                                if (roomStatus === 'Reserved') {
                                  const mainGuestName = res.platformGuest?.fullName || res.propertyGuest?.fullName || '';
                                  roomActionBtn = (
                                    <button
                                      disabled={isThisRoomBusy}
                                      onClick={() => askRoomAction(
                                        rr.reservationRoomId, 
                                        'CheckedIn',
                                        'Check in room?',
                                        `You are about to check in Room ${rr.room?.roomNumber}.\n\nPlease confirm or update the occupant name below.`,
                                        {
                                          inputLabel: 'Occupant Name',
                                          inputValue: rr.occupantName || mainGuestName,
                                        }
                                      )}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-success-600 text-text-inverted hover:bg-success-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isThisRoomBusy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Check In Room
                                    </button>
                                  );
                                } else if (roomStatus === 'CheckedIn') {
                                  roomActionBtn = (
                                    <div className="flex gap-2">
                                      <button
                                        disabled={isThisRoomBusy}
                                        onClick={() => {
                                          const occupant = rr.occupantName || 'Not assigned';
                                          askRoomAction(
                                            rr.reservationRoomId, 
                                            'CheckedOut',
                                            'Confirm Check-out',
                                            `You are about to check out Room ${rr.room?.roomNumber}.\n\nOccupant: ${occupant}\n\nPlease verify this is the correct guest before proceeding.`,
                                          );
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-text-inverted hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isThisRoomBusy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Check Out Room
                                      </button>
                                      
                                      {/* 🌟 NEW: Extend Stay Button */}
                                      <button
                                        disabled={isThisRoomBusy}
                                        onClick={() => {
                                          const currentCheckOut = new Date(rr.checkOutDate).toISOString().split('T')[0];
                                          const newDate = prompt(
                                            `Extend stay for Room ${rr.room?.roomNumber}\n\nCurrent check-out: ${currentCheckOut}\n\nEnter new check-out date (YYYY-MM-DD):`,
                                            currentCheckOut
                                          );
                                          
                                          if (newDate && newDate > currentCheckOut) {
                                            askRoomAction(
                                              rr.reservationRoomId,
                                              'extend',
                                              'Extend Stay?',
                                              `Extend Room ${rr.room?.roomNumber} from ${currentCheckOut} to ${newDate}?`,
                                              { newCheckOutDate: newDate }
                                            );
                                          } else if (newDate && newDate <= currentCheckOut) {
                                            toast.error('New date must be after current check-out date.');
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-warning-600 text-text-inverted hover:bg-warning-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        <Clock size={14} /> Extend
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={rr.reservationRoomId} className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="text-lg font-bold text-text">Room {rr.room?.roomNumber}</p>
                                        <p className="text-xs text-text-muted">{rr.room?.roomType?.typeName}</p>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                        roomStatus === 'CheckedIn' ? 'bg-success-50 text-success-700' :
                                        roomStatus === 'CheckedOut' ? 'bg-secondary-100 text-secondary-700' :
                                        'bg-primary-50 text-primary-700'
                                      }`}>
                                        {roomStatus}
                                      </span>
                                    </div>

                                    {/* 🌟 ACTUAL CHECK-IN/CHECK-OUT TIMES WITH EARLY/LATE INDICATORS */}
                                    {(rr.actualCheckIn || rr.actualCheckOut) && (
                                      <div className="space-y-2 pt-3 border-t border-border">
                                        {rr.actualCheckIn && (
                                          <div className="flex items-start gap-2">
                                            <LogIn size={14} className="text-success-600 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-xs font-bold text-text">Checked In</p>
                                              <div className="flex items-center gap-2">
                                                <p className="text-xs text-text-muted">
                                                  {new Date(rr.actualCheckIn).toLocaleString('en-US', { 
                                                    month: 'short', 
                                                    day: 'numeric',
                                                    hour: '2-digit', 
                                                    minute: '2-digit' 
                                                  })}
                                                </p>
                                                {(() => {
                                                  const actual = new Date(rr.actualCheckIn);
                                                  const standard = new Date(rr.checkInDate);
                                                  standard.setHours(14, 0, 0, 0);
                                                  const diffHours = (standard.getTime() - actual.getTime()) / (1000 * 60 * 60);
                                                  if (diffHours > 0.5) {
                                                    return (
                                                      <span className="text-[10px] font-bold text-warning-700 bg-warning-50 px-1.5 py-0.5 rounded border border-warning-200">
                                                        {Math.round(diffHours * 10) / 10}h early
                                                      </span>
                                                    );
                                                  } else if (diffHours < -0.5) {
                                                    return (
                                                      <span className="text-[10px] font-bold text-danger-700 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">
                                                        {Math.round(Math.abs(diffHours) * 10) / 10}h late
                                                      </span>
                                                    );
                                                  }
                                                  return null;
                                                })()}
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                        {rr.actualCheckOut && (
                                          <div className="flex items-start gap-2">
                                            <LogOut size={14} className="text-primary-600 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-xs font-bold text-text">Checked Out</p>
                                              <div className="flex items-center gap-2">
                                                <p className="text-xs text-text-muted">
                                                  {new Date(rr.actualCheckOut).toLocaleString('en-US', { 
                                                    month: 'short', 
                                                    day: 'numeric',
                                                    hour: '2-digit', 
                                                    minute: '2-digit' 
                                                  })}
                                                </p>
                                                {(() => {
                                                  const actual = new Date(rr.actualCheckOut);
                                                  const standard = new Date(rr.checkOutDate);
                                                  standard.setHours(11, 0, 0, 0);
                                                  const diffHours = (actual.getTime() - standard.getTime()) / (1000 * 60 * 60);
                                                  if (diffHours > 0.5) {
                                                    return (
                                                      <span className="text-[10px] font-bold text-danger-700 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">
                                                        {Math.round(diffHours * 10) / 10}h late
                                                      </span>
                                                    );
                                                  } else if (diffHours < -0.5) {
                                                    return (
                                                      <span className="text-[10px] font-bold text-success-700 bg-success-50 px-1.5 py-0.5 rounded border border-success-200">
                                                        {Math.round(Math.abs(diffHours) * 10) / 10}h early
                                                      </span>
                                                    );
                                                  }
                                                  return null;
                                                })()}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="pt-3 border-t border-border">
                                      <p className="text-xs text-text-muted mb-1">Occupant Name</p>
                                      <p className="text-sm font-semibold text-text">{rr.occupantName || 'Not assigned'}</p>
                                    </div>

                                    <div className="pt-3 border-t border-border flex items-center justify-between mt-auto">
                                      <p className="text-sm font-bold text-primary-600">{parseFloat(rr.agreedPricePerNight).toFixed(2)} GHS</p>
                                      {roomActionBtn || <span className="text-xs text-text-muted font-semibold">No actions</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border bg-secondary-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-text-muted">
              Showing <span className="font-semibold text-text">{startItem}</span> to <span className="font-semibold text-text">{endItem}</span> of <span className="font-semibold text-text">{pagination.total}</span>
              {isFetching && !isLoading && <Loader2 className="inline-block ml-2 animate-spin align-[-2px]" size={13} aria-label="Refreshing" />}
            </p>
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

      <ReservationModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setCreatedReservation(null); createMutation.reset(); }}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        createdReservation={createdReservation}
      />

      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title}
        message={pendingConfirm?.message}
        confirmLabel={pendingConfirm?.confirmLabel || 'Confirm'}
        danger={!!pendingConfirm?.danger}
        isLoading={isConfirmLoading}
        onConfirm={handleConfirm}
        onCancel={() => setPendingConfirm(null)}
        inputLabel={pendingConfirm?.inputLabel}
        inputValue={pendingConfirm?.inputValue}
        onInputChange={(value) => setPendingConfirm(prev => prev ? { ...prev, inputValue: value } : null)}
      />
    </div>
  );
}