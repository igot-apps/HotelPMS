import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/axios';
import toast from 'react-hot-toast';
import PublicNavbar from '../components/public/PublicNavbar';
import {
  Calendar, MapPin, Loader2, Search, ArrowLeft, Clock,
  CheckCircle2, XCircle, CreditCard, ChevronLeft, ChevronRight,
  BedDouble, Copy, Building2
} from 'lucide-react';

//  REUSABLE PAGINATION COMPONENT
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-12 pt-8 border-t border-border">
      <p className="text-sm text-text-muted">
        Page <span className="font-bold text-text">{currentPage}</span> of{' '}
        <span className="font-bold text-text">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-border bg-surface text-text hover:bg-secondary-50 hover:border-primary-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return <span key={`ellipsis-${idx}`} className="px-2 py-2 text-text-muted text-sm">...</span>;
            }
            const isActive = page === currentPage;
            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`min-w-[40px] h-10 px-3 text-sm font-semibold rounded-lg transition ${isActive ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30' : 'bg-surface border border-border text-text hover:bg-secondary-50 hover:border-primary-200'}`}
              >
                {page}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-border bg-surface text-text hover:bg-secondary-50 hover:border-primary-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default function PublicReservationsPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  useEffect(() => {
    const guestToken = localStorage.getItem('guestToken');
    if (!guestToken) {
      navigate('/discover');
    } else {
      setToken(guestToken);
    }
  }, [navigate]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['guestReservations', currentPage],
    queryFn: async () => {
      const res = await api.get('/public/reservations', {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: currentPage, limit: ITEMS_PER_PAGE }
      });
      return {
        reservations: res.data.data,
        pagination: res.data.pagination
      };
    },
    enabled: !!token,
  });

  // 🌟 FIX: Sort reservations so the newest (unpaid) ones appear at the top
  const reservations = (data?.reservations || []).sort((a, b) => {
    // Sort by creation date descending (newest first). 
    // Fallback to checkInDate just in case createdAt is missing.
    const dateA = new Date(a.createdAt || a.checkInDate);
    const dateB = new Date(b.createdAt || b.checkInDate);
    return dateB - dateA; 
  });
  const pagination = data?.pagination || { total: 0, totalPages: 1, page: 1 };
  const totalPages = pagination.totalPages;

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const copyConfirmationCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Confirmation code copied');
    } catch {
      toast.error('Could not copy the confirmation code');
    }
  };

  // 🌟 PAYMENT RETRY MUTATION
const retryPaymentMutation = useMutation({
  mutationFn: async (reservation) => {
    // 🛡️ CRITICAL CHECK: Prevent payment if the database says it's cancelled
    if (reservation.status === 'Cancelled') {
      throw new Error('This reservation has been cancelled. Payment is not allowed.');
    }

    const totalAmount = Number(reservation.totalAmount || 0);
    const amountPaid = Number(reservation.amountPaid || 0);
    const balanceDue = Math.max(0, totalAmount - amountPaid);
    const amountToPay = balanceDue > 0 ? balanceDue : totalAmount;

    const res = await api.post(`/public/${reservation.property.propertyCode}/payments/initialize`, {
       reservationId: reservation.reservationId,
       email: reservation.platformGuest?.email || 'guest@stayfolio.com',
       amount: amountToPay,
     });
     return res.data.data;
   },
    onSuccess: (paystackData) => {
      if (paystackData.authorization_url) {
        window.location.href = paystackData.authorization_url;
      } else {
        toast.error('Failed to initialize payment.');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Payment initialization failed.');
    }
  });

  // 🌟 FIXED LOGIC: Check actual DB status FIRST, then check payment status
  const getStatusBadge = (status, isFullyPaid) => {
    // 1. If the receptionist actually cancelled it, show Cancelled (Red)
    if (status === 'Cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-50 text-danger-700 border border-danger-100">
          <XCircle size={12} /> Cancelled
        </span>
      );
    }
    // 2. If it's NOT cancelled, but they haven't paid, show Awaiting Payment (Yellow)
    if (!isFullyPaid) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning-50 text-warning-700 border border-warning-100">
          <Clock size={12} /> Awaiting Payment
        </span>
      );
    }

    // 3. If fully paid, show normal statuses
    switch (status) {
      case 'Confirmed':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-100"><CheckCircle2 size={12} /> Confirmed</span>;
      case 'CheckedIn':
      case 'InHouse':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success-50 text-success-700 border border-success-100"><Clock size={12} /> Checked In</span>;
      case 'CheckedOut':
      case 'Completed':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary-50 text-secondary-700 border border-secondary-100"><CheckCircle2 size={12} /> Completed</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary-50 text-secondary-700 border border-secondary-100">{status}</span>;
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="max-w-5xl mx-auto px-4 py-12 space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-secondary-100 rounded-lg" />
          <div className="h-4 w-64 bg-secondary-100 rounded-lg" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-surface rounded-xl border border-border" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
          <div className="flex items-start gap-3 sm:gap-4">
            <button onClick={() => navigate(-1)} aria-label="Go back" className="mt-1 p-2.5 rounded-xl border border-border bg-surface hover:bg-secondary-50 text-text-muted transition">
            <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600 mb-1">Your account</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">My Reservations</h1>
              <p className="text-sm sm:text-base text-text-muted mt-1">Your stays, booking details, and payment status in one place.</p>
            </div>
          </div>
          {!isError && reservations.length > 0 && (
            <Link to="/discover" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text hover:border-primary-200 hover:text-primary-700 transition">
              <Building2 size={17} /> Browse hotels
            </Link>
          )}
        </div>

        {isError && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <XCircle size={48} className="mx-auto text-danger-500 mb-4" />
            <h3 className="text-xl font-bold text-text mb-2">Failed to load reservations</h3>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">Retry</button>
          </div>
        )}

        {!isError && reservations.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={32} className="text-text-muted" />
            </div>
            <h3 className="text-xl font-bold text-text mb-2">No reservations yet</h3>
            <Link to="/discover" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition">
              <Calendar size={18} /> Discover Hotels
            </Link>
          </div>
        )}

        {!isError && reservations.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4 px-1">
              <p className="text-sm text-text-muted"><span className="font-bold text-text">{pagination.total}</span> {pagination.total === 1 ? 'reservation' : 'reservations'}</p>
              <p className="text-xs text-text-muted">Newest bookings first</p>
            </div>
            <div className="space-y-5">
              {reservations.map((res) => {
                const roomCount = res.reservationRooms?.length || 1;
                const roomTypeName = res.reservationRooms?.[0]?.roomType?.typeName || res.reservationRooms?.[0]?.roomTypeNameSnapshot || 'Standard Room';
                const displayRoomText = roomCount > 1 ? `${roomCount}x ${roomTypeName}` : roomTypeName;
                
                //  CALCULATE BALANCE LOCALLY
                const totalAmount = Number(res.totalAmount || 0);
                const amountPaid = Number(res.amountPaid || 0);
                const balanceDue = Math.max(0, totalAmount - amountPaid);
                const isFullyPaid = balanceDue < 0.01;
                const paidPercent = totalAmount > 0 ? Math.min(100, Math.round((amountPaid / totalAmount) * 100)) : 0;

                return (
                  <article key={res.reservationId} className="overflow-hidden bg-surface border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 transition-all duration-200">
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center flex-wrap gap-2.5 mb-2">
                            <h2 className="text-lg sm:text-xl font-bold text-text">{res.property?.propertyName || 'Hotel reservation'}</h2>
                            {getStatusBadge(res.status, isFullyPaid)}
                          </div>
                          <p className="text-sm text-text-muted flex items-center gap-1.5">
                            <MapPin size={15} className="text-primary-600 flex-shrink-0" />
                            {[res.property?.city, res.property?.country || 'Ghana'].filter(Boolean).join(', ')}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] font-bold text-text-muted uppercase tracking-[0.14em] mb-1.5">Confirmation code</p>
                          <button
                            type="button"
                            onClick={() => copyConfirmationCode(res.confirmationCode)}
                            title="Copy confirmation code"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-100 bg-primary-50 text-primary-700 hover:bg-primary-100 transition"
                          >
                            <span className="text-sm font-black tracking-[0.12em]">{res.confirmationCode}</span>
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5 mt-5 p-4 sm:p-5 rounded-xl bg-secondary-50/80 border border-border">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Check-in</p>
                          <div className="flex items-center gap-2 text-text font-semibold">
                            <Calendar size={16} className="text-primary-600" /> {formatDate(res.checkInDate)}
                          </div>
                        </div>
                        <div className="hidden sm:block h-px w-12 bg-border" />
                        <div className="sm:text-right">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Check-out</p>
                          <div className="flex sm:justify-end items-center gap-2 text-text font-semibold">
                            <Calendar size={16} className="text-primary-600" /> {formatDate(res.checkOutDate)}
                          </div>
                        </div>
                        <div className="sm:col-span-3 pt-3 sm:pt-0 sm:mt-0 sm:border-t-0 border-t border-border flex items-center gap-2 text-sm text-text-muted">
                          <BedDouble size={16} className="text-primary-600" />
                          <span className="font-semibold text-text">{displayRoomText}</span>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-center">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                            <CreditCard size={16} className="text-text-muted" />
                            <span className="text-sm font-bold text-text">GH₵ {amountPaid.toFixed(2)}</span>
                            <span className="text-sm text-text-muted">paid of GH₵ {totalAmount.toFixed(2)}</span>
                            {!isFullyPaid && (
                              <span className="text-xs font-bold text-danger-700 bg-danger-50 px-2 py-1 rounded-lg border border-danger-100">
                                GH₵ {balanceDue.toFixed(2)} remaining
                              </span>
                            )}
                            {isFullyPaid && amountPaid > 0 && (
                              <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${res.status === 'Cancelled' ? 'text-warning-700 bg-warning-50 border-warning-200' : 'text-success-700 bg-success-50 border-success-100'}`}>
                                {res.status === 'Cancelled' ? 'Refund due' : 'Paid in full'}
                              </span>
                            )}
                          </div>
                          <div className="h-2 w-full max-w-lg overflow-hidden rounded-full bg-secondary-100" aria-label={`${paidPercent}% paid`}>
                            <div className={`h-full rounded-full transition-all ${isFullyPaid ? 'bg-success-500' : 'bg-primary-500'}`} style={{ width: `${paidPercent}%` }} />
                          </div>
                        </div>

                        <div className="w-full lg:w-auto">
                          {res.status === 'Cancelled' ? (
                            <span className="flex w-full lg:min-w-52 justify-center items-center gap-2 text-sm font-semibold text-danger-700 bg-danger-50 px-4 py-3 rounded-xl border border-danger-100">
                              <XCircle size={16} /> Reservation cancelled
                            </span>
                          ) : !isFullyPaid ? (
                            <button
                              onClick={() => retryPaymentMutation.mutate(res)}
                              disabled={retryPaymentMutation.isPending}
                              className="w-full lg:min-w-64 inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition shadow-sm shadow-primary-600/20 disabled:opacity-50"
                            >
                              {retryPaymentMutation.isPending ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />}
                              {retryPaymentMutation.isPending ? 'Starting secure checkout…' : `Pay remaining GH₵ ${balanceDue.toFixed(2)}`}
                            </button>
                          ) : (
                            <span className="flex w-full lg:min-w-52 justify-center items-center gap-2 text-sm font-semibold text-success-700 bg-success-50 px-4 py-3 rounded-xl border border-success-100">
                              <CheckCircle2 size={17} /> Payment complete
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
