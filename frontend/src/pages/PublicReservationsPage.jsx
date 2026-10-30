import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../lib/axios';
import toast from 'react-hot-toast';
import PublicNavbar from '../components/public/PublicNavbar';
import {
  Calendar, MapPin, Loader2, Search, ArrowLeft, Clock,
  CheckCircle2, XCircle, CreditCard, ChevronLeft, ChevronRight,
  BedDouble
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
  const location = useLocation();
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

  const { data, isLoading, isError, error } = useQuery({
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
    retry: false,
  });

  useEffect(() => {
    if (error?.response?.status !== 401) return;

    // The API interceptor clears an expired guest session. Return the guest to sign-in
    // instead of leaving them on a broken reservations screen.
    toast.error('Your guest session expired. Please sign in again.', { id: 'guest-session-expired' });
    navigate('/public/auth', {
      replace: true,
      state: { from: `${location.pathname}${location.search}` },
    });
  }, [error, location.pathname, location.search, navigate]);

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
        <div className="w-full max-w-[900px] mx-auto px-4 py-12 space-y-6 animate-pulse">
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
      <div className="w-full max-w-[900px] mx-auto px-4 py-12">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text">My Reservations</h1>
            <p className="text-sm text-text-muted">View and manage your upcoming and past stays.</p>
          </div>
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
            <div className="space-y-4">
              {reservations.map((res) => {
                const roomCount = res.reservationRooms?.length || 1;
                const roomTypeName = res.reservationRooms?.[0]?.roomType?.typeName || res.reservationRooms?.[0]?.roomTypeNameSnapshot || 'Standard Room';
                const displayRoomText = roomCount > 1 ? `${roomCount}x ${roomTypeName}` : roomTypeName;

                //  CALCULATE BALANCE LOCALLY
                const totalAmount = Number(res.totalAmount || 0);
                const amountPaid = Number(res.amountPaid || 0);
                const balanceDue = Math.max(0, totalAmount - amountPaid);
                const isFullyPaid = balanceDue < 0.01;

                return (
                  <div key={res.reservationId} className="group bg-surface border border-border rounded-xl p-6 hover:shadow-lg hover:border-primary-200 transition-all duration-300">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-lg font-bold text-text group-hover:text-primary-600 transition-colors">
                            {res.property?.propertyName}
                          </h3>
                          {/* 🌟 Pass isFullyPaid to badge */}
                          {getStatusBadge(res.status, isFullyPaid)}
                        </div>
                        <p className="text-sm text-text-muted flex items-center gap-1.5 mb-3">
                          <MapPin size={14} className="flex-shrink-0" /> {res.property?.city}, {res.property?.country || 'Ghana'}
                        </p>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2 text-text-muted">
                            <Calendar size={14} className="text-primary-600" />
                            <span className="font-medium text-text">{formatDate(res.checkInDate)} – {formatDate(res.checkOutDate)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-text-muted">
                            <BedDouble size={14} className="text-primary-600" />
                            <span className="font-medium text-text">{displayRoomText}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right md:text-right flex-shrink-0">
                        <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">Confirmation Code</p>
                        <p className="text-sm font-black text-primary-600 tracking-widest bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100 inline-block">
                          {res.confirmationCode}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t border-border gap-4">
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-text-muted" />
                        <div className="text-sm">
                          <span className="font-bold text-text">GH₵ {amountPaid.toFixed(2)}</span>
                          <span className="text-text-muted"> paid</span>
                          {!isFullyPaid && (
                            <span className="text-xs font-bold text-danger-600 bg-danger-50 px-2 py-0.5 rounded ml-2 border border-danger-100">
                              Balance: GH {balanceDue.toFixed(2)}
                            </span>
                          )}
                          {isFullyPaid && amountPaid > 0 && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ml-2 border inline-flex items-center gap-1 ${
                              res.status === 'Cancelled'
                                ? 'text-warning-700 bg-warning-50 border-warning-200'
                                : 'text-success-600 bg-success-50 border-success-100'
                            }`}>
                              {res.status === 'Cancelled' ? 'Refund Due' : 'Fully Paid'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 🌟 FIXED ACTION BUTTONS: Blocks payment if receptionist cancelled it */}
                      <div className="w-full sm:w-auto">
                        {res.status === 'Cancelled' ? (
                          <span className="block w-full text-center text-sm font-semibold text-danger-600 bg-danger-50 px-4 py-2.5 rounded-lg border border-danger-200">
                            <XCircle size={14} className="inline mr-1" /> Reservation Cancelled
                          </span>
                        ) : !isFullyPaid ? (
                          <button
                            onClick={() => retryPaymentMutation.mutate(res)}
                            disabled={retryPaymentMutation.isPending}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition shadow-md shadow-primary-600/20 disabled:opacity-50"
                          >
                            <CreditCard size={18} />
                            {retryPaymentMutation.isPending ? 'Processing...' : `Pay Balance (GH₵ ${balanceDue.toFixed(2)})`}
                          </button>
                        ) : (
                          <span className="block w-full text-center text-sm font-semibold text-success-600 bg-success-50 px-4 py-2.5 rounded-lg border border-success-100">
                            <CheckCircle2 size={14} className="inline mr-1" /> Payment Complete
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
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
