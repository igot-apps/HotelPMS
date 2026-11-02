import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import api from '../lib/axios';

export default function PublicBookingSuccessPage() {
  const { propertyCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const guestIdentity = (() => { try { const guest = JSON.parse(localStorage.getItem('guestInfo') || '{}'); return guest.guestId || guest.platformGuestId || guest.phone || 'guest'; } catch { return 'guest'; } })();
  const recoveryKey = `payment-return:${propertyCode}:${guestIdentity}`;
  const [reference] = useState(() => {
    const returnedReference = searchParams.get('reference') || searchParams.get('trxref');
    if (returnedReference) return returnedReference;
    try { return sessionStorage.getItem(recoveryKey) || ''; } catch { return ''; }
  });
  const checks = useRef(0);
  useEffect(() => {
    if (!reference) return;
    try {
      sessionStorage.setItem(recoveryKey, reference);
      window.history.replaceState(window.history.state, document.title, window.location.pathname);
    } catch { /* Keep the return URL usable when browser storage is disabled. */ }
  }, [reference, recoveryKey]);
  const { data: property } = useQuery({ queryKey: ['publicProperty', propertyCode], queryFn: async () => (await api.get(`/public/${propertyCode}`)).data.data });
  const verification = useQuery({
    queryKey: ['guestPaymentVerification', propertyCode, reference], enabled: Boolean(reference), retry: false,
    queryFn: async () => { checks.current++; return (await api.get(`/public/${propertyCode}/payments/verify/${encodeURIComponent(reference)}`)).data; },
    refetchInterval: query => checks.current < 6 && !['success', 'failed', 'reversed'].includes(query.state.data?.status) ? 5000 : false,
  });
  const transactionData = verification.data?.data;
  const verificationStatus = verification.data?.status === 'success' ? 'success' : reference && verification.isPending ? 'loading' : 'unconfirmed';
  const confirmedFailure = ['failed', 'reversed'].includes(verification.data?.status);
  const bookingReleased = ['Cancelled', 'Expired'].includes(transactionData?.bookingStatus);
  if (verificationStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary-600 mx-auto mb-4" size={48} />
          <p className="text-text-muted">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (verificationStatus === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-surface rounded-2xl shadow-xl border border-border p-4 sm:p-8 text-center">
          <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">{transactionData?.requiresRefundReview ? bookingReleased ? 'Payment received · Booking not confirmed' : 'Payment received · Review needed' : 'Payment Successful!'}</h1>
          <p className="text-text-muted mb-6">{transactionData?.requiresRefundReview ? bookingReleased ? 'This booking was already released. Your payment has been recorded for refund review. Contact the hotel; your room is not confirmed.' : 'Your booking is confirmed, but an extra payment requires hotel refund review. Do not pay again; contact the hotel about your credit.' : `Your reservation at ${property?.propertyName} has been confirmed.`}</p>
          
          <div className="bg-background p-4 rounded-lg border border-border text-left space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Reservation code:</span>
              <span className="font-bold text-primary-600 uppercase tracking-[0.16em]">{transactionData?.confirmationCode || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Amount Paid:</span>
              <span className="font-bold text-text">GH₵ {(transactionData?.amount / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Payment Method:</span>
              <span className="font-semibold text-text">
                {transactionData?.channel === 'mobile_money'
                  ? 'Mobile Money'
                  : transactionData?.channel === 'card'
                    ? 'Card'
                    : transactionData?.channel || 'Online payment'}
              </span>
            </div>
          </div>

          <p className="text-xs text-text-muted mb-6">
            {transactionData?.requiresRefundReview ? 'Keep this code when contacting the hotel about your payment.' : 'Please save this reservation code for check-in.'}
          </p>
          
          <button 
            onClick={() => navigate('/public/reservations')}
            className="w-full py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} /> My Reservations
          </button>
        </div>
      </div>
    );
  }

  // Failed state
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-surface rounded-2xl shadow-xl border border-border p-4 sm:p-8 text-center">
        <div className="w-16 h-16 bg-error-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={32} className="text-error-600" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">{confirmedFailure ? 'Payment not completed' : 'Payment status not confirmed'}</h1>
        <p className="text-text-muted mb-6">
          We have not confirmed a successful payment yet. If your bank or Mobile Money account was charged, do not pay again. Check the status or contact the hotel.
        </p>
        
        <div className="flex flex-col gap-3 sm:flex-row">
          <button 
            onClick={() => verification.refetch()} disabled={!reference || verification.isFetching}
            className="flex-1 py-3 border border-border text-text font-bold rounded-lg hover:bg-secondary-50 transition"
          >
            {verification.isFetching ? 'Checking…' : 'Check payment status'}
          </button>
          <button 
            onClick={() => navigate('/public/reservations')}
            className="flex-1 py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition"
          >
            My Reservations
          </button>
        </div>
      </div>
    </div>
  );
}
