import { Skeleton } from '../components/ui/Skeleton';
import ResponsiveTable from '../components/ui/ResponsiveTable';
import BackButton from '../components/ui/BackButton';
import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { bookingStatusLabel, roomStatusLabel, roomStatusTone } from '../lib/statusLabels';

import { hotelToday } from '../lib/period';
import useServerClock from '../lib/useServerClock';
// Today on the hotel's calendar (hotel time zone), not the computer's clock; falls back to the computer's date.
// Today on the hotel's calendar from the server's clock (never the computer's); null until server time is known.
const localToday = (timeZone) => hotelToday(timeZone);
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelReservation, extendReservationRoom, getReservationById, getReservationStats, updateGuestPresence, updateOccupantName, updateReservation, updateReservationRoomStatus } from '../api/reservations';
import toast from 'react-hot-toast';
import api from '../lib/axios';
import { recordPayment } from '../api/payments';
import {
  BedDouble, CreditCard, X, Loader2,
  CalendarDays, AlertCircle, Plus, Printer, ChevronDown, Smartphone, Undo2, Wrench, ChevronRight, XCircle
} from 'lucide-react';
import ReceiptModal from '../components/reservations/ReceiptModal';
import ThermalReceiptModal from '../components/reservations/ThermalReceiptModal';
import { formatPaymentMethod } from '../utils/payment';
import ReservationRecoveryPanel from '../components/reservations/ReservationRecoveryPanel';
import RefundPanel from '../components/reservations/RefundPanel';
import ExtendStayDialog from '../components/reservations/ExtendStayDialog';
import ShortenStayDialog from '../components/reservations/ShortenStayDialog';
import MoveRoomDialog from '../components/reservations/MoveRoomDialog';
import RoomOccupantDialog from '../components/reservations/RoomOccupantDialog';
import EarlyCheckoutDialog from '../components/reservations/EarlyCheckoutDialog';
import CheckoutOwingDialog from '../components/reservations/CheckoutOwingDialog';
import ReservationPaymentStatus from '../components/reservations/ReservationPaymentStatus';
import { useAuthStore } from '../store/authStore';
import { expectedCheckoutAt, formatDuration, formatTime } from '../lib/stayTiming';
import { serverNow } from '../lib/serverClock';

export default function ReservationDetailsPage() {
  useServerClock(); // re-render when server time arrives or is lost
  const { id } = useParams();
  const location = useLocation();
  const fix = new URLSearchParams(location.search).get('fix');
  const fixStay = new URLSearchParams(location.search).get('stay');
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();
  const panel = ['payments', 'refunds', 'corrections'].includes(location.hash.slice(1)) ? location.hash.slice(1) : null;
  const openPanel = (name) => navigate({ search: location.search, hash: name }, { replace: true });
  const closePanel = () => navigate({ search: panel === 'corrections' ? '' : location.search }, { replace: true });

  const queryClient = useQueryClient();

  // States for Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isThermalReceiptOpen, setIsThermalReceiptOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [extendRoom, setExtendRoom] = useState(null);
  const [shortenRoom, setShortenRoom] = useState(null);
  const [moveRoom, setMoveRoom] = useState(null);
  const [occupantDialog, setOccupantDialog] = useState(null);
  const [earlyCheckout, setEarlyCheckout] = useState(null);
  const [owingCheckout, setOwingCheckout] = useState(null);
  const [checkoutConfirm, setCheckoutConfirm] = useState(null);
  const [presenceDialog, setPresenceDialog] = useState(null);
  const handledAction = useRef('');
  // Same cancellation as the Reservations list (server applies the refund policy and all checks).
  const cancelMutation = useMutation({
    mutationFn: () => cancelReservation(id),
    onSuccess: () => {
      ['reservation', 'reservations', 'rooms', 'payments', 'dashboardActive'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      toast.success('Reservation cancelled');
      setConfirmCancel(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not cancel the reservation. Please try again.'),
  });

  // States for Form Data
  const [editData, setEditData] = useState({ notes: '', source: '' });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Cash',
    gatewayReference: '',
    notes: ''
  });

  // 1. Fetch Data
  const { data: resData, isLoading: isLoadingRes } = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => getReservationById(id).then(res => res.data.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['reservationStats', id],
    queryFn: () => getReservationStats(id).then(res => res.data.data),
  });

  const { data: refundOverview } = useQuery({
    queryKey: ['refunds', id],
    queryFn: async () => (await api.get(`/reservations/${id}/refunds`)).data.data,
    enabled: Boolean(id && ['Manager', 'Receptionist'].includes(user?.role)),
    refetchInterval: 30000,
  });

  // 2. Mutations
  const updateMutation = useMutation({
    mutationFn: (data) => updateReservation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      setIsEditModalOpen(false);
    },
  });

  const paymentMutation = useMutation({
    // 🌟 FIXED: reservationId is now a UUID string, not parseInt
    mutationFn: (data) => recordPayment({ ...data, reservationId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      queryClient.invalidateQueries({ queryKey: ['reservationStats', id] });
      setIsPaymentModalOpen(false);
      setPaymentData({ amount: '', paymentMethod: 'Cash', gatewayReference: '', notes: '' });
    },
  });

  const extendMutation = useMutation({
    mutationFn: (newCheckOutDate) => extendReservationRoom(extendRoom.reservationRoomId, newCheckOutDate),
    onSuccess: () => {
      ['reservation', 'reservations', 'rooms', 'availability', 'calendarReservations', 'operationalOverview'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      setExtendRoom(null);
      toast.success('Stay extended successfully.');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not extend the stay.'),
  });

  const refreshRoomData = () => {
    ['reservation', 'reservations', 'rooms', 'availability', 'calendarReservations', 'dashboardActive', 'operationalOverview', 'dashboardGlance', 'owedAfterCheckout', 'checkoutAlerts', 'myDay'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const roomActionMutation = useMutation({
    mutationFn: ({ roomId, status, ...details }) => updateReservationRoomStatus(roomId, { status, ...details }, { skipErrorToast: true }),
    onSuccess: () => {
      refreshRoomData();
      setOccupantDialog(null);
      setCheckoutConfirm(null);
      toast.success('Room status updated');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not update the room. Please try again.'),
  });

  const occupantMutation = useMutation({
    mutationFn: ({ roomId, ...details }) => updateOccupantName(roomId, details.occupantName, details.occupantPhone, details.duplicateOccupantConfirmation),
    onSuccess: () => {
      refreshRoomData();
      setOccupantDialog(null);
      toast.success('Occupant details updated');
    },
  });

  const presenceMutation = useMutation({
    mutationFn: ({ roomId, action, expectedReturnAt }) => updateGuestPresence(roomId, action, expectedReturnAt),
    onSuccess: (_response, variables) => {
      refreshRoomData();
      setPresenceDialog(null);
      toast.success(variables.action === 'out' ? 'Guest marked temporarily out.' : 'Guest marked back in the room.');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not update the guest’s presence.'),
  });

  const completeCheckout = async (room, details = {}) => {
    await roomActionMutation.mutateAsync({ roomId: room.reservationRoomId, status: 'CheckedOut', ...details });
  };

  const startCheckout = (room) => {
    const today = localToday(resData.property?.timezone);
    if (!today) return toast.error('Still getting the hotel time. Try again in a moment.');
    if (today < String(room.checkOutDate).slice(0, 10)) {
      setEarlyCheckout({ room, reservation: resData, today });
      return;
    }
    const due = expectedCheckoutAt(room.checkOutDate, resData.property?.checkOutTime, resData.property?.timezone);
    const late = (serverNow()?.getTime() ?? due.getTime()) - due.getTime();
    const lateText = late >= 60000 ? `Late departure: ${formatDuration(late)} after the ${formatTime(due, resData.property?.timezone)} checkout time. No extra night is charged.` : '';
    const balance = Math.round((Number(resData.totalAmount || 0) - Number(resData.amountPaid || 0)) * 100) / 100;
    const otherCheckedInRooms = (resData.reservationRooms || []).filter((stay) => stay.reservationRoomId !== room.reservationRoomId && stay.status === 'CheckedIn');
    if (balance > 0.01 && !otherCheckedInRooms.length) {
      setOwingCheckout({ room, balanceDue: balance, lateText });
      return;
    }
    setCheckoutConfirm({ room, lateText, balance, otherCheckedInRooms });
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    updateMutation.mutate(editData);
  };

  const handlePaymentChange = (e) => {
    setPaymentData({ ...paymentData, [e.target.name]: e.target.value });
  };

  const handleRecordPayment = (e) => {
    e.preventDefault();
    paymentMutation.mutate({
      amount: parseFloat(paymentData.amount),
      paymentMethod: paymentData.paymentMethod,
      gatewayReference: paymentData.gatewayReference || null,
      notes: paymentData.notes || null,
    });
  };

  useEffect(() => {
    if (!resData) return;
    const params = new URLSearchParams(location.search);
    const action = params.get('do');
    const key = `${location.search}:${resData.reservationId}`;
    if (!action || handledAction.current === key) return;
    const room = resData.reservationRooms?.find((stay) => stay.reservationRoomId === Number(params.get('stay')));
    handledAction.current = key;
    if (action === 'checkin' && room?.status === 'Reserved') setOccupantDialog({ room, reservation: resData, mode: 'checkin' });
    else if (action === 'checkout' && room?.status === 'CheckedIn') startCheckout(room);
    else if (action === 'extend' && room?.status === 'CheckedIn') setExtendRoom(room);
    else if (action === 'shorten' && room?.status === 'CheckedIn') setShortenRoom(room);
    else if (action === 'pay') {
      navigate({ search: '', hash: 'payments' }, { replace: true });
      return;
    }
    navigate({ search: '', hash: location.hash }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resData, location.search]);

  if (isLoadingRes) return <div role="status" className="space-y-4"><span className="sr-only">Loading reservation details…</span><Skeleton className="h-8 w-64" /><Skeleton className="h-28 rounded-xl" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64 rounded-xl lg:col-span-2" /><Skeleton className="h-64 rounded-xl" /></div></div>;
  if (!resData) return <div className="p-8 text-center text-danger-600">Reservation not found.</div>;

  // ✅ CALCULATED ON-DEMAND from the single source of truth
  const fmt = (val) => parseFloat(val || 0).toFixed(2);
  const totalAmount = parseFloat(resData?.totalAmount || 0);
  const amountPaid = parseFloat(resData?.amountPaid || 0);
  const balanceDue = ['Cancelled', 'NoShow', 'Expired'].includes(resData?.status) ? 0 : Math.max(0, totalAmount - amountPaid); // a closed booking owes nothing
  const approvedRefunds = refundOverview?.requests?.filter(request => request.status === 'Approved') || [];
  const approvedRefundTotal = approvedRefunds.reduce((sum, request) => sum + Number(request.input?.amount || 0), 0);
  const pendingRefunds = refundOverview?.requests?.filter(request => request.status === 'Pending') || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="min-w-0 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <BackButton fallback="/reservations" label="Back" />
          <div>
            <h1 className="text-2xl font-bold text-text">Reservation {resData.confirmationCode || `#${resData.reservationId.slice(0, 8).toUpperCase()}`}</h1>
            <p className="text-sm text-text-muted flex items-center gap-2 mt-1">
              <CalendarDays size={14} />
              {new Date(resData.checkInDate).toLocaleDateString()} → {new Date(resData.checkOutDate).toLocaleDateString()}
            </p>
            <div className="mt-2"><ReservationPaymentStatus reservation={resData} compact /></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* 🌟 UPDATED: Professional Status Badge */}
          <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
            resData.status === 'InHouse' ? 'bg-success-50 text-success-700' :
            resData.status === 'Completed' ? 'bg-secondary-100 text-secondary-700' :
            resData.status === 'Confirmed' ? 'bg-primary-50 text-primary-700' :
            resData.status === 'Cancelled' ? 'bg-danger-50 text-danger-700' :
            resData.status === 'Expired' ? 'bg-warning-50 text-warning-700' :
            resData.status === 'NoShow' ? 'bg-orange-50 text-orange-700' :
            'bg-secondary-100 text-secondary-700'
          }`}>
            {bookingStatusLabel(resData.status, resData.reservationRooms)}
          </span>

          {['Pending', 'Confirmed'].includes(resData.status) && !resData.reservationRooms?.some((stay) => stay.status === 'CheckedIn') && (
            <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-danger-200 bg-surface px-4 py-2 text-sm font-semibold text-danger-700 hover:bg-danger-50">
              <XCircle size={16} /> Cancel reservation
            </button>
          )}

          {/* Print Options Dropdown */}
          <div className="relative group">
            <button onClick={() => setIsPrintMenuOpen(open => !open)} aria-expanded={isPrintMenuOpen} aria-label="Print options" className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:bg-secondary-50 transition">
              <Printer size={16} /> Print <ChevronDown size={14} />
            </button>
            <div className={`absolute left-0 sm:left-auto sm:right-0 mt-2 w-56 bg-surface border border-border rounded-lg shadow-lg transition-all z-50 ${isPrintMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
              <button
                onClick={() => { setIsReceiptOpen(true); setIsPrintMenuOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-text hover:bg-secondary-50 transition flex flex-col border-b border-border"
              >
                <span className="font-semibold">A4 Guest Folio</span>
                <span className="text-xs text-text-muted">Detailed invoice for standard printers</span>
              </button>
              <button
                onClick={() => { setIsThermalReceiptOpen(true); setIsPrintMenuOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-text hover:bg-secondary-50 transition flex flex-col"
              >
                <span className="font-semibold">80mm Thermal Receipt</span>
                <span className="text-xs text-text-muted">Compact format for front desk printers</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Rooms: always visible, each with its own status and everyday actions (room-level). */}
      <section aria-labelledby="booking-rooms-title" className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="booking-rooms-title" className="flex items-center gap-2 font-bold text-text"><BedDouble size={18} /> Rooms in this booking <span className="text-sm font-normal text-text-muted">({resData.reservationRooms?.length || 0})</span></h2>
          <p className="text-xs text-text-muted">Room buttons change only that room. Payments and refunds are for the whole booking.</p>
        </div>
        {!resData.reservationRooms?.length && <p className="text-sm text-text-muted">No rooms assigned to this reservation.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {resData.reservationRooms?.map((rr) => {
            const active = ['Confirmed', 'InHouse'].includes(resData.status);
            const today = localToday(resData.property?.timezone);
            const canCheckIn = active && rr.status === 'Reserved' && Boolean(today) && String(rr.checkInDate).slice(0, 10) <= today;
            const inRoom = active && rr.status === 'CheckedIn';
            const btn = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold';
            return (
              <li key={rr.reservationRoomId} className="rounded-lg border border-border bg-secondary-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-text">Room {rr.room?.roomNumber || rr.roomNumberSnapshot || 'Removed'}</p>
                    <p className="text-xs text-text-muted">{rr.roomType?.typeName || rr.room?.roomType?.typeName || rr.roomTypeNameSnapshot || 'Room type removed'} · {fmt(rr.agreedPricePerNight)} GHS per night</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${roomStatusTone(rr.status)}`}>{roomStatusLabel(rr.status)}</span>
                    {rr.status === 'CheckedIn' && <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${rr.guestPresenceStatus === 'Out' ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'}`}>{rr.guestPresenceStatus === 'Out' ? 'Temporarily out' : 'In room'}</span>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-text-muted">{new Date(rr.checkInDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} → {new Date(rr.checkOutDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>
                <p className="break-words text-sm text-text"><span className="text-text-muted">Occupant: </span>{rr.occupantName || 'Not assigned'}{rr.occupantPhone ? ` · ${rr.occupantPhone}` : ''}</p>
                {rr.status === 'CheckedIn' && rr.guestPresenceStatus === 'Out' && <div className="mt-1 text-xs text-warning-800"><p>{rr.guestOutAt ? `Out since ${new Date(rr.guestOutAt).toLocaleString()}` : 'Guest is temporarily out'}</p>{rr.expectedReturnAt && <p className="text-text-muted">Expected back {new Date(rr.expectedReturnAt).toLocaleString()}</p>}</div>}
                {rr.status === 'CheckedIn' && rr.guestPresenceStatus !== 'Out' && rr.guestReturnedAt && <p className="mt-1 text-xs text-success-700">Back in room since {new Date(rr.guestReturnedAt).toLocaleString()}</p>}
                {rr.status === 'Reserved' && rr.room?.operationalStatus === 'Occupied' && <p className="mt-1 text-xs font-semibold text-danger-700">Room {rr.room.roomNumber} still has a guest checked in. Check them out (or verify their departure) first, or move this guest to another room.</p>}
                {rr.status === 'Reserved' && rr.room?.housekeepingStatus && !['Clean', 'Inspected'].includes(rr.room.housekeepingStatus) && <p className="mt-1 text-xs font-semibold text-warning-700">Room needs cleaning before check-in</p>}
                {rr.status === 'NoShow' && <p className="mt-1 text-xs font-semibold text-orange-700">Expired: the guest did not arrive before the departure date. Create a new booking if they come.</p>}
                {(canCheckIn || inRoom || (active && rr.status === 'Reserved')) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canCheckIn && <button type="button" onClick={() => setOccupantDialog({ room: rr, reservation: resData, mode: 'checkin' })} className={`${btn} bg-success-600 text-white hover:bg-success-700`}>Check in</button>}
                    {inRoom && <button type="button" onClick={() => startCheckout(rr)} className={`${btn} bg-primary-600 text-white hover:bg-primary-700`}>Check out</button>}
                    {inRoom && <button type="button" onClick={() => setExtendRoom(rr)} className={`${btn} border border-border bg-surface text-text hover:bg-secondary-50`}>Extend</button>}
                    {inRoom && <button type="button" onClick={() => setShortenRoom(rr)} className={`${btn} border border-border bg-surface text-text hover:bg-secondary-50`}>Shorten</button>}
                    {inRoom && <button type="button" onClick={() => setMoveRoom(rr)} className={`${btn} border border-border bg-surface text-text hover:bg-secondary-50`}>Move to another room</button>}
                    {inRoom && (rr.guestPresenceStatus === 'Out' ? <button type="button" disabled={presenceMutation.isPending} onClick={() => presenceMutation.mutate({ roomId: rr.reservationRoomId, action: 'returned' })} className={`${btn} bg-success-600 text-white hover:bg-success-700 disabled:opacity-50`}>{presenceMutation.isPending && presenceMutation.variables?.roomId === rr.reservationRoomId ? 'Updating…' : 'Mark back in room'}</button> : <button type="button" disabled={presenceMutation.isPending} onClick={() => setPresenceDialog({ room: rr })} className={`${btn} border border-warning-300 bg-surface text-warning-800 hover:bg-warning-50 disabled:opacity-50`}>Mark temporarily out</button>)}
                    {['Reserved', 'CheckedIn'].includes(rr.status) && <button type="button" onClick={() => setOccupantDialog({ room: rr, reservation: resData, mode: 'edit' })} className={`${btn} border border-border bg-surface text-text hover:bg-secondary-50`}>Edit occupant</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Whole booking</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <PanelButton icon={CreditCard} title="Payments" hint={`Paid ${fmt(amountPaid)} GHS · ${balanceDue > 0 ? `due ${fmt(balanceDue)} GHS` : 'nothing due'}`} tone={balanceDue > 0 ? 'danger' : 'neutral'} onClick={() => openPanel('payments')} />
            <PanelButton icon={Undo2} title="Refunds" hint={approvedRefunds.length > 0 ? `GHS ${fmt(approvedRefundTotal)} approved · not yet returned` : pendingRefunds.length > 0 ? 'Awaiting approval' : Number(resData.refundDue) > 0 ? `GHS ${fmt(resData.refundDue)} remaining` : resData.refunds?.length ? `${resData.refunds.length} refund(s) recorded` : 'No refunds'} tone={approvedRefunds.length > 0 || Number(resData.refundDue) > 0 ? 'warning' : 'neutral'} onClick={() => openPanel('refunds')} />
            <PanelButton icon={Wrench} title="Correct or undo" hint="Fix a mistake: undo check-in/out, restore, move, dates, payments" onClick={() => openPanel('corrections')} />
          </div>
        </div>
      </section>

      {panel === 'payments' && (
        <ActionDialog icon={CreditCard} title="Payments" subtitle={`${resData.confirmationCode || ''} · whole booking`} onClose={closePanel}>
          <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
            <Figure label="Total" value={`${fmt(totalAmount)} GHS`} />
            <Figure label={resData.refunds?.length ? 'Net paid' : 'Paid'} value={`${fmt(amountPaid)} GHS`} />
            <Figure label="Balance due" value={`${fmt(balanceDue)} GHS`} danger={balanceDue > 0} />
          </div>
          <h3 className="mb-2 text-sm font-bold text-text">Payment history <span className="font-normal text-text-muted">({resData.payments?.length || 0})</span></h3>
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={balanceDue <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} /> Record Payment
          </button>
        </div>
        {resData.payments?.length > 0 ? (
          <div className="overflow-x-auto">
            <ResponsiveTable className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Date</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Method</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Reference</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Status</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Recorded by</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {resData.payments.map(p => (
                  <tr key={p.paymentId} className="border-b border-border last:border-0 hover:bg-secondary-50/30 transition">
                    <td className="px-4 py-3 text-sm text-text">{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${p.paymentMethod === 'Card' ? 'bg-primary-50 text-primary-700' : p.paymentMethod === 'MobileMoney' || p.paymentMethod === 'Mobile Money' ? 'bg-warning-50 text-warning-700' : 'bg-secondary-100 text-secondary-700'}`}>
                        {p.paymentMethod === 'MobileMoney' || p.paymentMethod === 'Mobile Money' ? <Smartphone size={13} /> : <CreditCard size={13} />}
                        {formatPaymentMethod(p.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted font-mono text-xs">{p.gatewayReference || '-'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-md text-xs font-semibold ${p.status === 'Completed' ? 'bg-success-50 text-success-700' : p.status === 'Refunded' ? 'bg-warning-50 text-warning-800' : 'bg-secondary-100 text-secondary-700 line-through'}`}>{p.status}</span></td>
                    <td className="px-4 py-3 text-sm text-text">{p.verifiedProvider ? `Online · ${p.verifiedProvider} (verified)` : p.receiver?.fullName || 'Unknown / former staff'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-text text-right">{fmt(p.amount)} GHS</td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-8 bg-secondary-50/50 rounded-lg border border-dashed border-border">
            No payments recorded yet. Click "Record Payment" to add one.
          </p>
        )}
        </ActionDialog>
      )}
      {panel === 'refunds' && (
        <ActionDialog icon={Undo2} title="Refunds" subtitle={`${resData.confirmationCode || ''} · whole booking`} onClose={closePanel}>
          <RefundPanel reservation={resData} embedded />
        </ActionDialog>
      )}
      {panel === 'corrections' && (
        <ActionDialog icon={Wrench} title="Correct or undo a mistake" subtitle={`${resData.confirmationCode || ''} · each change is recorded with its reason`} onClose={closePanel}>
          <ReservationRecoveryPanel key={`${fix || 'none'}-${fixStay || ''}`} reservation={resData} embedded initialAction={fix || undefined} initialStayId={fixStay || undefined} />
        </ActionDialog>
      )}

      {extendRoom && <ExtendStayDialog room={extendRoom} busy={extendMutation.isPending} onClose={() => setExtendRoom(null)} onConfirm={(date) => extendMutation.mutate(date)} />}
      {shortenRoom && <ShortenStayDialog room={shortenRoom} reservationId={resData.reservationId} timeZone={resData.property?.timezone} policyAllowsShortening={resData.property?.allowEarlyDepartureChargeReduction} onClose={() => setShortenRoom(null)} />}
      {moveRoom && <MoveRoomDialog room={moveRoom} reservation={resData} onClose={() => setMoveRoom(null)} />}
      {occupantDialog && <RoomOccupantDialog key={`${occupantDialog.room.reservationRoomId}-${occupantDialog.mode}`} {...occupantDialog} busy={roomActionMutation.isPending || occupantMutation.isPending} onClose={() => setOccupantDialog(null)} onSubmit={(details) => occupantDialog.mode === 'checkin' ? roomActionMutation.mutateAsync({ roomId: occupantDialog.room.reservationRoomId, status: 'CheckedIn', ...details }) : occupantMutation.mutateAsync({ roomId: occupantDialog.room.reservationRoomId, ...details })} />}
      {earlyCheckout && <EarlyCheckoutDialog key={earlyCheckout.room.reservationRoomId} {...earlyCheckout} onClose={() => setEarlyCheckout(null)} onCheckOut={async () => { await completeCheckout(earlyCheckout.room); setEarlyCheckout(null); }} />}
      {owingCheckout && <CheckoutOwingDialog key={owingCheckout.room.reservationRoomId} roomNumber={owingCheckout.room.room?.roomNumber || owingCheckout.room.roomNumberSnapshot} guestName={owingCheckout.room.occupantName || resData.guestNameSnapshot || resData.propertyGuest?.fullName || 'Guest'} code={resData.confirmationCode} balanceDue={owingCheckout.balanceDue} lateText={owingCheckout.lateText} onClose={() => setOwingCheckout(null)} onTakePayment={() => { setOwingCheckout(null); openPanel('payments'); }} onCheckOut={async (overrideReason, departureNote) => { await completeCheckout(owingCheckout.room, { overrideReason, departureNote }); toast.success(`Checked out. GHS ${Number(owingCheckout.balanceDue).toFixed(2)} is still owed.`); setOwingCheckout(null); }} />}
      {presenceDialog && (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="presence-dialog-title">
          <section className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 id="presence-dialog-title" className="text-lg font-bold text-text">Mark temporarily out</h2>
            <p className="mt-2 text-sm text-text-muted">Room {presenceDialog.room.room?.roomNumber || presenceDialog.room.roomNumberSnapshot} remains occupied and the guest stays checked in. This does not check them out or change any charges.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={presenceMutation.isPending} onClick={() => setPresenceDialog(null)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text">Cancel</button><button type="button" disabled={presenceMutation.isPending} onClick={() => presenceMutation.mutate({ roomId: presenceDialog.room.reservationRoomId, action: 'out' })} className="min-h-11 rounded-lg bg-warning-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{presenceMutation.isPending ? 'Updating…' : 'Confirm temporarily out'}</button></div>
          </section>
        </div>
      )}
      {checkoutConfirm && (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="checkout-confirm-title">
          <section className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 id="checkout-confirm-title" className="text-lg font-bold text-text">Check out Room {checkoutConfirm.room.room?.roomNumber || checkoutConfirm.room.roomNumberSnapshot}?</h2>
            <p className="mt-2 text-sm text-text-muted">Occupant: {checkoutConfirm.room.occupantName || 'Not assigned'}. Only this room will be checked out.</p>
            {checkoutConfirm.lateText && <p className="mt-3 text-sm font-semibold text-warning-700">{checkoutConfirm.lateText}</p>}
            {checkoutConfirm.balance > 0.01 && checkoutConfirm.otherCheckedInRooms.length > 0 && <p className="mt-3 text-sm text-text-muted">The booking still owes GHS {checkoutConfirm.balance.toFixed(2)}. The balance remains on the booking while the other room{checkoutConfirm.otherCheckedInRooms.length === 1 ? '' : 's'} stay checked in.</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={roomActionMutation.isPending} onClick={() => setCheckoutConfirm(null)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text">Cancel</button><button type="button" disabled={roomActionMutation.isPending} onClick={() => completeCheckout(checkoutConfirm.room).catch(() => {})} className="min-h-11 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{roomActionMutation.isPending ? 'Checking out…' : 'Check out room'}</button></div>
          </section>
        </div>
      )}

      {/* ========================================== */}
      {/* 1. Record Payment Modal                    */}
      {/* ========================================== */}
      {isPaymentModalOpen && (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-xl font-bold text-text">Record Payment</h2>
                <p className="text-xs text-text-muted mt-1">Reservation {resData.confirmationCode || `#${resData.reservationId.slice(0, 8).toUpperCase()}`} • Balance: {fmt(balanceDue)} GHS</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted"><X size={20} /></button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              {paymentMutation.isError && (
                <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5" />
                  <span>{paymentMutation.error?.response?.data?.message || 'Failed to record payment'}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Amount (GHS) *</label>
                <input type="number" step="0.01" name="amount" value={paymentData.amount} onChange={handlePaymentChange} required placeholder={fmt(balanceDue)} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Payment Method *</label>
                <select name="paymentMethod" value={paymentData.paymentMethod} onChange={handlePaymentChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition">
                  <option value="Cash">Cash</option>
                  <option value="Card">Credit/Debit Card</option>
                  <option value="MobileMoney">Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Gateway Reference</label>
                <input type="text" name="gatewayReference" value={paymentData.gatewayReference} onChange={handlePaymentChange} placeholder="e.g., MM-REF-12345 (Optional)" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
                <input type="text" name="notes" value={paymentData.notes} onChange={handlePaymentChange} placeholder="e.g., Partial payment (Optional)" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
                <button type="submit" disabled={paymentMutation.isPending} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                  {paymentMutation.isPending && <Loader2 className="animate-spin" size={16} />} Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. Edit Notes Modal                        */}
      {/* ========================================== */}
      {isEditModalOpen && (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold text-text">Edit Reservation</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Booking Source</label>
                <select value={editData.source} onChange={(e) => setEditData({...editData, source: e.target.value})} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="Walk-in">Walk-in</option>
                  <option value="Phone">Phone</option>
                  <option value="Website">Website</option>
                  <option value="Direct">Direct</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Internal Notes</label>
                <textarea value={editData.notes} onChange={(e) => setEditData({...editData, notes: e.target.value})} rows="3" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
                <button type="submit" disabled={updateMutation.isPending} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                  {updateMutation.isPending && <Loader2 className="animate-spin" size={16} />} Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 3. RECEIPT MODALS                          */}
      {/* ========================================== */}
        {confirmCancel && (
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !cancelMutation.isPending && setConfirmCancel(false)}>
            <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <h2 id="cancel-title" className="text-lg font-bold text-text">Cancel reservation?</h2>
              <p className="mt-2 text-sm text-text-muted">This will cancel reservation {resData.confirmationCode || `#${id.slice(0, 8)}`}. This can't be undone from here.</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" disabled={cancelMutation.isPending} onClick={() => setConfirmCancel(false)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-secondary-50 disabled:opacity-50">Keep reservation</button>
                <button type="button" disabled={cancelMutation.isPending} onClick={() => cancelMutation.mutate()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white hover:bg-danger-700 disabled:opacity-50">
                  {cancelMutation.isPending && <Loader2 size={16} className="animate-spin" />} Cancel Reservation
                </button>
              </div>
            </div>
          </div>
        )}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        reservation={resData}
        stats={{
          totalAmount,
          totalPaid: amountPaid,
          balanceDue,
          totalNights: statsData?.totalNights || 0
        }}
      />
      <ThermalReceiptModal
        isOpen={isThermalReceiptOpen}
        onClose={() => setIsThermalReceiptOpen(false)}
        reservation={resData}
        stats={{
          totalAmount,
          totalPaid: amountPaid,
          balanceDue,
          totalNights: statsData?.totalNights || 0
        }}
      />
    </div>
  );
}

// ==========================================
// Helper Component
// ==========================================
// Whole-booking action that opens a dialog.
function PanelButton({ icon: Icon, title, hint, tone = 'neutral', onClick }) {
  const tones = { neutral: 'text-text-muted', danger: 'text-danger-700', warning: 'text-warning-700' };
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:border-primary-300 hover:bg-secondary-50">
      <Icon size={20} className="shrink-0 text-primary-600" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-text">{title}</span><span className={`block text-xs ${tones[tone]}`}>{hint}</span></span>
      <ChevronRight size={18} className="shrink-0 text-text-muted" />
    </button>
  );
}

// Large dialog for a whole-booking area: a bottom sheet on phones, centred on desktop. Esc closes it.
function ActionDialog({ icon: Icon, title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !document.querySelector('.fixed.inset-0.z-50:not([data-action-dialog])')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div data-action-dialog className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92vh] w-full min-w-0 flex-col rounded-t-2xl border border-border bg-surface shadow-xl sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text"><Icon size={20} className="shrink-0 text-primary-600" /> {title}</h2>
            {subtitle && <p className="truncate text-sm text-text-muted">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border text-text"><X size={18} /></button>
        </div>
        <div className="min-w-0 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function Figure({ label, value, danger = false }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2 sm:p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`font-bold ${danger ? 'text-danger-700' : 'text-text'}`}>{value}</p>
    </div>
  );
}
