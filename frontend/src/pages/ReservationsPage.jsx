import { Skeleton, SkeletonTableRows } from '../components/ui/Skeleton';
import ReservationPaymentStatus from '../components/reservations/ReservationPaymentStatus';
import RefundSummary from '../components/reservations/RefundSummary';
import RefundApprovalBadge from '../components/reservations/RefundApprovalBadge';
import { useState, useEffect, useRef, Fragment } from 'react';
import { useSearchParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  getReservations,
  createReservation,
  cancelReservation,
  updateReservationRoomStatus,
  extendReservationRoom,
  updateOccupantName,
} from '../api/reservations';
import { recordPayment } from '../api/payments';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import BookingPaymentNotice from '../components/reservations/BookingPaymentNotice';
import { createWalkInBooking } from '../lib/createWalkInBooking';
import RoomOccupantDialog from '../components/reservations/RoomOccupantDialog';
import EarlyCheckoutDialog from '../components/reservations/EarlyCheckoutDialog';
import ExtendStayDialog from '../components/reservations/ExtendStayDialog';
import ShortenStayDialog from '../components/reservations/ShortenStayDialog';
import TakePaymentDialog from '../components/reservations/TakePaymentDialog';
import CheckoutOwingDialog from '../components/reservations/CheckoutOwingDialog';
import BulkRoomsDialog from '../components/reservations/BulkRoomsDialog';
import { bookingStatusLabel, roomStatusLabel, roomStatusTone } from '../lib/statusLabels';
import { expectedCheckoutAt, formatDuration, formatTime } from '../lib/stayTiming';

// The hotel's calendar day as YYYY-MM-DD, using the browser's local time.
import { hotelToday } from '../lib/period';
import { serverNow } from '../lib/serverClock';
import useServerClock from '../lib/useServerClock';
// Today on the hotel's calendar (hotel time zone), not the computer's clock; falls back to the computer's date.
// Today on the hotel's calendar from the server's clock (never the computer's); null until server time is known.
const localToday = (timeZone) => hotelToday(timeZone);
import {
  Search, Plus, CalendarDays, AlertCircle, XCircle,
  ChevronLeft, ChevronRight, Eye, X,
  Loader2, Undo2, SlidersHorizontal
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────
// Lightweight confirmation modal with optional input field
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, isLoading = false, onConfirm, onCancel, inputLabel, inputValue, onInputChange, secondaryInputLabel, secondaryInputValue, onSecondaryInputChange }) {
  if (!open) return null;
  return (
    <div
      className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onCancel(); }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-lg w-full max-w-sm p-5">
        <h3 id="confirm-dialog-title" className="text-base font-bold text-text mb-1.5">{title}</h3>
        <p className="text-sm text-text-muted mb-4 whitespace-pre-line">{message}</p>
        
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

        {secondaryInputLabel && (
          <div className="mb-4">
            <label className="block text-xs font-semibold text-text-muted mb-1.5">{secondaryInputLabel}</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={secondaryInputValue || ''}
              onChange={(e) => onSecondaryInputChange && onSecondaryInputChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
            {secondaryInputValue && !/^\d{10}$/.test(secondaryInputValue) && (
              <p className="mt-1 text-xs text-danger-600">Enter exactly 10 digits.</p>
            )}
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


const BACK_LABELS = { overdue: 'Overstays', arrivals: 'Arrivals to check in', departures: 'Departures to check out', inHouse: 'Guests in house', free: 'Rooms free tonight', collected: 'Collected today', unpaid: 'Owed by guests in house', owedAfter: 'Owed after checkout', attention: 'Needs attention', dashboard: 'the dashboard', booking: 'the booking details', rooms: 'Rooms & Inventory' };

export default function ReservationsPage() {
  useServerClock(); // re-render when server time arrives or is lost
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');
  const [createdReservation, setCreatedReservation] = useState(null);
  const [paymentRecoveryReservation, setPaymentRecoveryReservation] = useState(() => location.state?.paymentRecoveryReservation || null);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [earlyCheckout, setEarlyCheckout] = useState(null);
  const [extendRoom, setExtendRoom] = useState(null);
  const [shortenStay, setShortenStay] = useState(null);
  const [paymentFor, setPaymentFor] = useState(null);
  const [owingCheckout, setOwingCheckout] = useState(null);
  const [bulkRooms, setBulkRooms] = useState(null);
  const [newBookingInitial, setNewBookingInitial] = useState(null);
  const checkoutTargetRef = useRef(null);
  // Open the "guest still owes" checkout for the room being checked out.
  const openOwingCheckout = (balanceDue) => {
    const target = checkoutTargetRef.current;
    if (!target) return;
    setPendingConfirm(null);
    setEarlyCheckout(null);
    setOwingCheckout({ ...target, balanceDue });
  };
  const [occupantDialog, setOccupantDialog] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';
  const backPanel = searchParams.get('back');

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
    refetchInterval: 15000,
  });

  const reservations = data?.data || [];

  // Links from the dashboard: ?open=<reservationId>&do=checkin|checkout|extend|pay&stay=<roomStayId>,
  // or ?new=1 to start a booking. The booking opens and the action starts, then the link params are cleared.
  const handledLink = useRef('');
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      // A free room tapped on the dashboard is pre-selected (only if it is still free for the dates).
      const room = Number(searchParams.get('room'));
      setNewBookingInitial(Number.isSafeInteger(room) && room > 0 ? { roomIds: [room] } : null);
      setIsModalOpen(true); updateParams({ new: null, room: null }); return;
    }
    const open = searchParams.get('open');
    if (!open || isLoading || isPlaceholderData || handledLink.current === searchParams.toString()) return;
    const res = reservations.find((item) => item.reservationId === open);
    if (!res) return;
    handledLink.current = searchParams.toString();
    setExpandedId(open);
    const action = searchParams.get('do');
    const stay = res.reservationRooms?.find((item) => item.reservationRoomId === Number(searchParams.get('stay')));
    if (action === 'checkin' && stay?.status === 'Reserved') setOccupantDialog({ room: stay, reservation: res, mode: 'checkin' });
    if (action === 'checkout' && stay?.status === 'CheckedIn') startCheckOut(stay, res);
    if (action === 'extend' && stay?.status === 'CheckedIn') setExtendRoom(stay);
    if (action === 'shorten' && stay?.status === 'CheckedIn') setShortenStay({ room: stay, reservationId: res.reservationId, reservation: res });
    if (action === 'pay') setPaymentFor(res);
    if (action) updateParams({ do: null, stay: null });
    setTimeout(() => [...document.querySelectorAll(`[data-booking="${open}"]`)].find((el) => el.offsetParent !== null)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, reservations, isLoading, isPlaceholderData]);
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const totalPages = Math.ceil(pagination.total / limit);
  const startItem = pagination.total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, pagination.total);
  const hasActiveFilters = status !== 'all' || !!fromDate || !!toDate || !!search;

  // 🌟 Room action mutation
  const roomActionMutation = useMutation({
    mutationFn: ({ id, status, occupantName, occupantPhone, duplicateOccupantConfirmation, uncleanRoomConfirmed, departureNote, overrideReason }) => {
      const data = { status };
      if (departureNote) data.departureNote = departureNote;
      if (overrideReason) data.overrideReason = overrideReason;
      if (occupantName !== undefined) data.occupantName = occupantName;
      if (occupantPhone !== undefined) data.occupantPhone = occupantPhone;
      if (duplicateOccupantConfirmation !== undefined) data.duplicateOccupantConfirmation = duplicateOccupantConfirmation;
      if (uncleanRoomConfirmed) data.uncleanRoomConfirmed = true;
      // The occupant dialog shows its own errors and warnings inline.
      // Checkout refused because money is owed opens the owing dialog instead of an error toast.
      return updateReservationRoomStatus(id, data, occupantDialog || earlyCheckout || owingCheckout || status === 'CheckedOut' ? { skipErrorToast: true } : undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] });
      toast.success('Room status updated');
      setPendingConfirm(null);
      setOccupantDialog(null);
      for (const key of ['reservation', 'reservationCorrections', 'operationalOverview', 'dashboardGlance', 'owedAfterCheckout', 'checkoutAlerts', 'myDay']) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err, variables) => {
      if (variables?.status === 'CheckedOut' && err.response?.data?.code === 'BALANCE_OWING' && !owingCheckout) {
        openOwingCheckout(err.response.data.details?.balanceDue);
        return;
      }
      if (occupantDialog || earlyCheckout || owingCheckout) return; // these dialogs show the error inline
      toast.dismiss();
      toast.error(err.response?.data?.message || 'Failed to update room status');
      setPendingConfirm(null);
    },
  });

  // 🌟 Extend stay mutation
  const extendStayMutation = useMutation({
    mutationFn: ({ id, newCheckOutDate }) => extendReservationRoom(id, newCheckOutDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['calendarReservations'] });
      queryClient.invalidateQueries({ queryKey: ['operationalOverview'] });
      toast.success('Stay extended successfully!');
      setPendingConfirm(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to extend stay');
      setPendingConfirm(null);
    },
  });

  // 🌟 Update occupant name mutation
  const updateOccupantMutation = useMutation({
    mutationFn: ({ id, occupantName, occupantPhone, duplicateOccupantConfirmation }) => updateOccupantName(id, occupantName, occupantPhone, duplicateOccupantConfirmation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Occupant details updated');
      setOccupantDialog(null);
      for (const key of ['reservation', 'reservationCorrections', 'operationalOverview']) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => {
      if (!occupantDialog) toast.error(err.response?.data?.message || 'Failed to update occupant name');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return createWalkInBooking(payload, { createReservation, recordPayment });
    },
    onSuccess: ({ response, reservation, paymentError }) => {
      setPaymentRecoveryReservation(paymentError ? reservation : null);
      if (paymentError) toast.error('Reservation saved. Review its initial payment below.');
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
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardActive'] });
      toast.success(variables.action === 'refund' ? 'Reservation refund recorded' : 'Reservation cancelled');
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

  // 🌟 Handle confirm - handles check-ins and extends
  const handleConfirm = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.kind === 'reservation') {
      actionMutation.mutate({ id: pendingConfirm.id, action: pendingConfirm.action });
    } else {
      const payload = { 
        id: pendingConfirm.id, 
        status: pendingConfirm.status 
      };
      
      if (pendingConfirm.status === 'CheckedIn') {
        payload.occupantName = pendingConfirm.inputValue?.trim() || '';
        payload.occupantPhone = pendingConfirm.secondaryInputValue?.trim() || '';
        if (!payload.occupantName) {
          toast.error('Enter the occupant name before checking in.');
          return;
        }
        if (payload.occupantPhone && !/^\d{10}$/.test(payload.occupantPhone)) {
          toast.error('Occupant phone number must be exactly 10 digits.');
          return;
        }
      }
      
      if (pendingConfirm.status === 'CheckedOut' && pendingConfirm.inputValue?.trim()) {
        payload.departureNote = pendingConfirm.inputValue.trim().slice(0, 300);
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
    (pendingConfirm?.kind === 'room' && (roomActionMutation.isPending || extendStayMutation.isPending));

  const handleFilterChange = (key, value) => updateParams({ [key]: value, page: 1 });
  const clearFilters = () => { updateParams({ search: '', status: '', fromDate: '', toDate: '', page: 1 }); setLocalSearch(''); };

  // Starts checkout for one room (early-checkout choice, late note) — shared by row, room card and dashboard links.
  const startCheckOut = (room, res) => {
    // Before the scheduled departure date, ask how to handle the remaining nights.
    const today = localToday(res.property?.timezone);
    if (!today) { toast.error('Still getting the time from the server. Try again in a moment.'); return; }
    if (today < String(room.checkOutDate).slice(0, 10)) {
      checkoutTargetRef.current = { room, reservation: res, lateText: '' };
      setEarlyCheckout({ room, reservation: res, today });
      return;
    }
    const occupant = room.occupantName || 'Not assigned';
    // Past the hotel's checkout time: show how late and allow a note (no extra charge).
    const due = expectedCheckoutAt(room.checkOutDate, res.property?.checkOutTime, res.property?.timezone);
    const late = (serverNow()?.getTime() ?? due.getTime()) - due.getTime();
    checkoutTargetRef.current = { room, reservation: res, lateText: late >= 60000 ? `Late departure: ${formatDuration(late)} after the ${formatTime(due, res.property?.timezone)} checkout time. No extra night is charged.` : '' };
    // Money still owed: when this is the last room still checked in, offer to take payment first or check
    // out with a reason. While other rooms of the booking stay checked in, the balance simply stays on the booking.
    const owing = Math.round((Number(res.totalAmount || 0) - Number(res.amountPaid || 0)) * 100) / 100;
    const othersInRoom = (res.reservationRooms || []).filter((stay) => stay.reservationRoomId !== room.reservationRoomId && stay.status === 'CheckedIn');
    if (owing > 0.01 && !othersInRoom.length) { openOwingCheckout(owing); return; }
    const code = res.confirmationCode || `#${res.reservationId.slice(0, 8)}`;
    const balanceNote = owing > 0.01 ? `\n\nBooking balance: GHS ${owing.toFixed(2)}. This belongs to the whole booking ${code}, not to this room. It stays on the booking while Room ${othersInRoom.map((stay) => stay.room?.roomNumber || stay.roomNumberSnapshot).join(', ')} ${othersInRoom.length === 1 ? 'is' : 'are'} still checked in.` : owing < -0.01 && !othersInRoom.length ? `\n\nThe guest has paid GHS ${(-owing).toFixed(2)} more than the booking total. Refund or settle this credit separately.` : '';
    askRoomAction(
      room.reservationRoomId,
      'CheckedOut',
      `Check out Room ${room.room?.roomNumber || room.roomNumberSnapshot} · ${code}`,
      `Only Room ${room.room?.roomNumber || room.roomNumberSnapshot} is checked out.\n\nOccupant: ${occupant}${late >= 60000 ? `\n\nLate departure: ${formatDuration(late)} after the ${formatTime(due)} checkout time. No extra night is charged.` : ''}${balanceNote}\n\nPlease verify this is the correct guest before proceeding.`,
    );
  };

  // The next thing staff usually do with a booking, shown right on its row:
  // check in (arrival due), check out (guest in house), take payment (balance due).
  // Bookings with several rooms open their room list instead, so each room is handled on its own.
  // Every room of the booking with its own status, so partly checked-in/out bookings are clear at a glance.
  const renderRoomChips = (res, fallback) => {
    const stays = res.reservationRooms || [];
    if (!stays.length) return <span>{fallback}</span>;
    if (stays.length === 1 && ['Cancelled', 'Expired', 'NoShow'].includes(res.status)) return <span>{fallback}</span>;
    return (
      <ul className="flex flex-wrap gap-1.5">
        {stays.map((stay) => (
          <li key={stay.reservationRoomId} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${roomStatusTone(stay.status)}`}>
            {stay.room?.roomNumber || stay.roomNumberSnapshot || 'Removed'} · {roomStatusLabel(stay.status)}
          </li>
        ))}
      </ul>
    );
  };
  return (
    <div className="space-y-6">
      {backPanel && (
        <Link to={backPanel === 'booking' ? `/reservations/${searchParams.get('open')}` : backPanel === 'rooms' ? '/rooms' : backPanel === 'dashboard' ? '/dashboard' : `/dashboard?panel=${backPanel}`}
          className="flex min-h-11 w-fit max-w-full items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm font-semibold text-primary-700 hover:bg-primary-100">
          <ChevronLeft size={18} /> Back to {BACK_LABELS[backPanel] || 'the dashboard'} {backPanel !== 'booking' && <span className="hidden font-normal text-primary-600 sm:inline">— the list is already updated, continue with the next guest</span>}
        </Link>
      )}
      <RefundSummary />
      <BookingPaymentNotice reservation={paymentRecoveryReservation} onDismiss={() => setPaymentRecoveryReservation(null)} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">Bookings</h1>
          <p className="text-text-muted text-sm mt-1">Total matching: <span className="font-bold text-text">{pagination.total}</span></p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> New Booking
        </button>
      </div>

      {/* Filters UI */}
      <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4">
        <div className="flex gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="Search guest, phone, room, or reference"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 sm:py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
            {isSearchPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" size={16} aria-label="Searching" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowMobileFilters((value) => !value)}
            aria-expanded={showMobileFilters}
            className="inline-flex md:hidden items-center justify-center gap-2 px-3 rounded-lg border border-border bg-background text-sm font-semibold text-text"
          >
            <SlidersHorizontal size={16} />
            <span>Filters</span>
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-primary-600" aria-label="Filters active" />}
          </button>
          <select
            value={status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="hidden md:block px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="all">All Statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="InHouse">In house</option>
            <option value="Completed">Checked out</option>
            <option value="Cancelled">Cancelled</option>
            <option value="NoShow">Expired</option>
          </select>
        </div>
        <div className={`${showMobileFilters ? 'grid' : 'hidden'} md:grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-border`}>
          <div className="md:hidden">
            <label className="block text-xs font-semibold text-text-muted mb-1">Status</label>
            <select value={status} onChange={(e) => handleFilterChange('status', e.target.value)} className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20">
              <option value="all">All Statuses</option>
              <option value="Confirmed">Confirmed</option>
              <option value="InHouse">In house</option>
              <option value="Completed">Checked out</option>
              <option value="Cancelled">Cancelled</option>
              <option value="NoShow">Expired</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Check-in From</label>
            <input type="date" value={fromDate} onChange={(e) => handleFilterChange('fromDate', e.target.value)} className="w-full min-w-0 px-3 py-2.5 md:py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">Departure To</label>
            <input type="date" value={toDate} onChange={(e) => handleFilterChange('toDate', e.target.value)} className="w-full min-w-0 px-3 py-2.5 md:py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 hover:text-danger-700 transition"><X size={14} /> Clear Filters</button>
          </div>
        )}
      </div>

      {/* Mobile reservation cards */}
      <div className={`md:hidden space-y-3 ${isPlaceholderData ? 'opacity-60 pointer-events-none' : ''}`}>
        {isLoading ? (
          [0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)
        ) : isError ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <AlertCircle size={28} className="mx-auto mb-2 text-danger-600" />
            <p className="font-semibold text-text">Couldn't load bookings</p>
            <p className="mt-1 text-sm text-text-muted">{error?.response?.data?.message || error?.message || 'Something went wrong'}</p>
            <button onClick={() => refetch()} className="mt-4 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold">Try again</button>
          </div>
        ) : reservations.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">
            <CalendarDays size={28} className="mx-auto mb-2" />
            <p className="font-semibold text-text">No bookings found</p>
            {hasActiveFilters ? <button onClick={clearFilters} className="mt-2 text-sm font-semibold text-primary-600">Clear filters and try again</button> : <p className="mt-1 text-sm">New bookings will show up here</p>}
          </div>
        ) : reservations.map((res) => {
          const id = res.reservationId;
          const isExpanded = expandedId === id;
          const guestName = res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Guest name unavailable';
          const phone = res.guestPhoneSnapshot || res.platformGuest?.phone || res.propertyGuest?.phone;
          const rooms = res.reservationRooms?.map((room) => room.room?.roomNumber || room.roomNumberSnapshot || 'Removed').join(', ') || 'Not assigned';
          const cardStatusClass = res.status === 'Confirmed' ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20' : res.status === 'InHouse' ? 'bg-success-50 text-success-700 ring-1 ring-success-600/20' : res.status === 'Cancelled' ? 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20' : res.status === 'NoShow' ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-600/20' : res.status === 'Expired' ? 'bg-warning-50 text-warning-700 ring-1 ring-warning-600/20' : 'bg-secondary-100 text-secondary-700';
          const cardStatusLabel = bookingStatusLabel(res.status, res.reservationRooms);

          return (
            <article key={id} data-booking={id} className={`overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow ${isExpanded ? 'border-primary-400 ring-2 ring-primary-500/30' : 'border-border'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary-700">{res.confirmationCode || `#${id.slice(0, 8)}`}</p>
                    <p className="mt-2 text-xs text-text-muted">Booking contact</p>
                    <h2 className="mt-1 break-words text-base font-bold leading-snug text-text">{guestName}</h2>
                    {phone && <p className="mt-0.5 text-sm text-text-muted">{phone}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cardStatusClass}`}>{cardStatusLabel}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-secondary-50/70 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-muted">Stay dates</p>
                    <p className="mt-1 font-semibold text-text">{new Date(res.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(res.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-muted">Room{res.reservationRooms?.length === 1 ? '' : 's'}</p>
                    <div className="mt-1">{renderRoomChips(res, rooms)}</div>
                  </div>
                </div>

                <RefundApprovalBadge reservation={res} />
                <div className="mt-3"><ReservationPaymentStatus reservation={res} showTotal /></div>

                <div className="mt-2 flex gap-2">
                  {['Cancelled', 'Expired'].includes(res.status) && res.refundStatus === 'Pending' && permissions?.includes('CanCancelReservation') && (
                    <Link to={`/reservations/${id}#refunds`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 text-sm font-semibold text-danger-700">
                      <Undo2 size={16} /> Manage refund {parseFloat(res.refundDue || 0).toFixed(2)} GHS
                    </Link>
                  )}
                  {['Cancelled', 'Expired'].includes(res.status) && Number(res.refundDue) <= 0 && res.refunds?.length > 0 && <Link to={`/reservations/${id}#refunds`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold text-primary-700">Refund history</Link>}
                  <Link to={`/reservations/${id}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 text-sm font-semibold text-primary-700 hover:bg-primary-100">
                    <Eye size={16} /> Open booking
                  </Link>
                </div>

                {/* Always visible so staff don't have to look for it; it still asks for confirmation. Rooms whose guest never arrives expire automatically on the departure date. */}
                {['Pending', 'Confirmed'].includes(res.status) && !res.reservationRooms?.some(stay => stay.status === 'CheckedIn') && (
                  <div className="mt-2 flex gap-2">
                    {['Pending', 'Confirmed'].includes(res.status) && !res.reservationRooms?.some(stay => stay.status === 'CheckedIn') && (
                      <button onClick={() => askReservationAction(id, 'cancel', 'Cancel booking?', `This will cancel booking ${res.confirmationCode || `#${id.slice(0, 8)}`}. This can't be undone from here.`, { danger: true, confirmLabel: 'Cancel booking' })} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger-200 px-3 text-sm font-semibold text-danger-700 hover:bg-danger-50"><XCircle size={16} /> Cancel booking</button>
                    )}
                  </div>
                )}

              </div>
            </article>
          );
        })}
      </div>

      <div className="md:hidden flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted">Showing {startItem}–{endItem} of {pagination.total}</p>
          <select value={limit} onChange={(e) => updateParams({ limit: e.target.value, page: 1 })} className="mt-1 bg-transparent text-xs font-semibold text-text outline-none">
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => updateParams({ page: page - 1 })} disabled={page === 1 || isPlaceholderData} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-text disabled:opacity-40"><ChevronLeft size={16} /> Prev</button>
          <span className="text-xs font-semibold text-text-muted">{page}/{totalPages || 1}</span>
          <button onClick={() => updateParams({ page: page + 1 })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-text disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Desktop reservation table */}
      <div className="hidden md:block bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <th className="w-10 px-2 py-3"></th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">ID / Booking contact</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Room(s)</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Dates</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Payment</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={isPlaceholderData ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
              {isLoading ? (
                <SkeletonTableRows colSpan="7" cols={5} label="Loading bookings…" />
              ) : isError ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-danger-600">
                      <AlertCircle size={24} />
                      <p className="font-semibold">Couldn't load bookings</p>
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
                      <p className="font-semibold">No bookings found</p>
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
                  const rooms = res.reservationRooms?.map(r => r.room?.roomNumber || r.roomNumberSnapshot || 'Removed').join(', ') || 'N/A';
                  const checkIn = new Date(res.checkInDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const checkOut = new Date(res.checkOutDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                  // 🌟 UPDATED: Professional Status Colors
                  let statusClass = 'bg-secondary-100 text-secondary-700';
                  if (res.status === 'Confirmed') statusClass = 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20';
                  if (res.status === 'InHouse') statusClass = 'bg-success-50 text-success-700 ring-1 ring-success-600/20';
                  if (res.status === 'Completed') statusClass = 'bg-secondary-100 text-secondary-600';
                  if (res.status === 'Cancelled') statusClass = 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';
                  if (res.status === 'Expired') statusClass = 'bg-warning-50 text-warning-700 ring-1 ring-warning-600/20';
                  if (res.status === 'NoShow') statusClass = 'bg-orange-50 text-orange-700 ring-1 ring-orange-600/20';

                  const isExpanded = expandedId === res.reservationId;
                  // No Show only once the guest can no longer be expected (same rule as the server).

                  // 🌟 UPDATED: Actions with No Show support
                  let actions = null;
                  if (['Cancelled', 'Expired'].includes(res.status) && res.refundStatus === 'Pending' && permissions?.includes('CanCancelReservation')) {
                    actions = (
                      <Link to={`/reservations/${res.reservationId}#refunds`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"><Undo2 size={14} /> Manage refund</Link>
                    );
                  }

                  // Cancel only before anyone is in the room (same rule as the server and the mobile cards).
                  if (['Pending', 'Confirmed'].includes(res.status) && !res.reservationRooms?.some(stay => stay.status === 'CheckedIn')) {
                    actions = (
                      <div className="flex items-center justify-end gap-2">
                        {actions}
                        <button
                          onClick={() => askReservationAction(
                            res.reservationId, 'cancel',
                            'Cancel reservation?',
                            `This will cancel reservation #${res.reservationId}. This can't be undone from here.`,
                            { danger: true, confirmLabel: 'Cancel booking' },
                          )}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"
                        >
                          <XCircle size={14} /> Cancel
                        </button>
                      </div>
                    );
                  }

                  if (['Cancelled', 'Expired'].includes(res.status) && Number(res.refundDue) <= 0 && res.refunds?.length > 0) actions = <Link to={`/reservations/${res.reservationId}#refunds`} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs font-semibold text-primary-700">Refund history</Link>;

                  return (
                    <Fragment key={res.reservationId}>
                      <tr data-booking={res.reservationId} className={`transition-colors ${isExpanded ? 'bg-primary-50/70' : 'border-b border-border last:border-0 hover:bg-secondary-50/50'}`}>
                        <td className={`px-2 py-4 ${isExpanded ? 'shadow-[inset_4px_0_0_0_theme(colors.primary.600)]' : ''}`}>
                        </td>
                     <td className="px-6 py-4">
                       {/* 1. Confirmation Code */}
                       <p className="text-sm font-bold text-primary-600 tracking-wider">
                         {res.confirmationCode || `#${res.reservationId.slice(0, 8)}`}
                       </p>
                       {/* 2. Guest Name */}
                       <p className="text-xs font-medium text-text mt-0.5">
                         {res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'N/A'}
                       </p>
                       {/* 3. Phone Number (New) */}
                       <p className="text-xs text-text-muted mt-0.5">
                         {res.guestPhoneSnapshot || res.platformGuest?.phone || res.propertyGuest?.phone || 'N/A'}
                       </p>
                     </td>
                        <td className="px-6 py-4 text-sm text-text font-medium">{renderRoomChips(res, rooms)}</td>
                        <td className="px-6 py-4 text-sm text-text-muted">{checkIn} <span className="mx-1">→</span> {checkOut}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>{bookingStatusLabel(res.status, res.reservationRooms)}</span>
                            <RefundApprovalBadge reservation={res} />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <ReservationPaymentStatus reservation={res} showTotal align="right" compact />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link to={`/reservations/${res.reservationId}`} className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100" aria-label={`Open booking ${res.reservationId}`}><Eye size={14} /> Open booking</Link>
                            {actions}
                          </div>
                        </td>
                      </tr>

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
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-1">
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
        initialData={newBookingInitial}
        onClose={() => { setIsModalOpen(false); setNewBookingInitial(null); setCreatedReservation(null); createMutation.reset(); if (createdReservation) navigate('/bookings', { replace: true }); }}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        createdReservation={createdReservation}
      />

      {occupantDialog && <RoomOccupantDialog key={`${occupantDialog.room.reservationRoomId}-${occupantDialog.mode}`} {...occupantDialog} busy={roomActionMutation.isPending || updateOccupantMutation.isPending} onClose={() => setOccupantDialog(null)} onSubmit={details => occupantDialog.mode === 'checkin' ? roomActionMutation.mutateAsync({ id: occupantDialog.room.reservationRoomId, status: 'CheckedIn', ...details }) : updateOccupantMutation.mutateAsync({ id: occupantDialog.room.reservationRoomId, ...details })} />}
      {paymentFor && <TakePaymentDialog key={paymentFor.reservationId} reservation={paymentFor} onClose={() => setPaymentFor(null)} />}
      {bulkRooms && (
        <BulkRoomsDialog
          key={`${bulkRooms.mode}-${bulkRooms.reservation.reservationId}`}
          mode={bulkRooms.mode}
          reservation={bulkRooms.reservation}
          onClose={() => setBulkRooms(null)}
          onTakePayment={() => { setPaymentFor(bulkRooms.reservation); setBulkRooms(null); }}
          onDone={() => {
            for (const key of ['reservations', 'rooms', 'dashboardActive', 'reservation', 'operationalOverview', 'dashboardGlance', 'owedAfterCheckout', 'checkoutAlerts', 'myDay']) queryClient.invalidateQueries({ queryKey: [key] });
          }}
        />
      )}
      {owingCheckout && (
        <CheckoutOwingDialog
          key={owingCheckout.room.reservationRoomId}
          roomNumber={owingCheckout.room.room?.roomNumber || owingCheckout.room.roomNumberSnapshot}
          guestName={owingCheckout.room.occupantName || owingCheckout.reservation.guestNameSnapshot || owingCheckout.reservation.propertyGuest?.fullName || 'Guest'}
          code={owingCheckout.reservation.confirmationCode}
          balanceDue={owingCheckout.balanceDue}
          lateText={owingCheckout.lateText}
          onClose={() => setOwingCheckout(null)}
          onTakePayment={() => {
            // Payment first; the receptionist then taps Check out again (normal checkout once settled).
            setPaymentFor({ ...owingCheckout.reservation, amountPaid: Number(owingCheckout.reservation.totalAmount || 0) - Number(owingCheckout.balanceDue || 0) });
            setOwingCheckout(null);
          }}
          onCheckOut={async (overrideReason, departureNote) => {
            await roomActionMutation.mutateAsync({ id: owingCheckout.room.reservationRoomId, status: 'CheckedOut', overrideReason, departureNote });
            toast.success(`Checked out. GHS ${Number(owingCheckout.balanceDue || 0).toFixed(2)} is still owed and listed under "Owed after checkout".`);
            setOwingCheckout(null);
          }}
        />
      )}
      {shortenStay && <ShortenStayDialog key={shortenStay.room.reservationRoomId} {...shortenStay} policyAllowsShortening={shortenStay.reservation?.property?.allowEarlyDepartureChargeReduction} onClose={() => setShortenStay(null)} />}
      {extendRoom && (
        <ExtendStayDialog
          room={extendRoom}
          onClose={() => setExtendRoom(null)}
          onConfirm={(newDate) => {
            const currentCheckOut = String(extendRoom.checkOutDate).slice(0, 10);
            askRoomAction(extendRoom.reservationRoomId, 'extend', 'Extend Stay?', `Extend Room ${extendRoom.room?.roomNumber} from ${currentCheckOut} to ${newDate}?`, { newCheckOutDate: newDate });
            setExtendRoom(null);
          }}
        />
      )}
      {earlyCheckout && (
        <EarlyCheckoutDialog
          key={earlyCheckout.room.reservationRoomId}
          {...earlyCheckout}
          onClose={() => setEarlyCheckout(null)}
          onCheckOut={async () => {
            await roomActionMutation.mutateAsync({ id: earlyCheckout.room.reservationRoomId, status: 'CheckedOut' });
            setEarlyCheckout(null);
          }}
        />
      )}
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
        secondaryInputLabel={pendingConfirm?.secondaryInputLabel}
        secondaryInputValue={pendingConfirm?.secondaryInputValue}
        onSecondaryInputChange={(value) => setPendingConfirm(prev => prev ? { ...prev, secondaryInputValue: value } : null)}
      />
    </div>
  );
}
