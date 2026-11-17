import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, CalendarCheck, Clock } from 'lucide-react';
import BookingSteps from '../components/public/BookingSteps';
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
  useEffect(() => {
    if (!reference || verification.error?.response?.status !== 401) return;
    const query = new URLSearchParams({ reference });
    navigate('/public/auth', { replace: true, state: { from: { pathname: `/public/${propertyCode}/booking-success`, search: `?${query}` } } });
  }, [navigate, propertyCode, reference, verification.error]);
  const transactionData = verification.data?.data;
  const verificationStatus = verification.data?.status === 'success' ? 'success' : reference && verification.isPending ? 'loading' : 'unconfirmed';
  const confirmedFailure = ['failed', 'reversed'].includes(verification.data?.status);
  const bookingReleased = ['Cancelled', 'Expired'].includes(transactionData?.bookingStatus);
  const shell = (children, step, failed = false) => (
    <div className="min-h-screen bg-gradient-to-b from-primary-50/60 to-background px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm"><BookingSteps current={step} failed={failed} /></div>
        <div className="rounded-2xl border border-border bg-surface p-5 text-center shadow-xl sm:p-8">{children}</div>
        {property?.propertyName && <p className="text-center text-xs text-text-muted">{property.propertyName}{property.city ? ` · ${property.city}` : ''}</p>}
      </div>
    </div>
  );

  if (verificationStatus === 'loading') {
    return shell(
      <div className="py-6">
        <Loader2 className="mx-auto mb-4 animate-spin text-primary-600" size={44} />
        <p className="font-semibold text-text">Confirming your payment…</p>
        <p className="mt-1 text-sm text-text-muted">This usually takes a few seconds. Please don't pay again.</p>
      </div>, 1);
  }

  if (verificationStatus === 'success') {
    const review = transactionData?.requiresRefundReview;
    return shell(
      <>
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${review ? 'bg-warning-50' : 'bg-success-50'}`}>
          {review ? <AlertTriangle size={32} className="text-warning-600" /> : <CheckCircle2 size={34} className="text-success-600" />}
        </div>
        <h1 className="mb-2 text-2xl font-bold text-text">{review ? bookingReleased ? 'Payment received · Booking not confirmed' : 'Payment received · Review needed' : 'You\'re booked!'}</h1>
        <p className="mb-6 text-text-muted">{review ? bookingReleased ? 'This booking was already released. Your payment has been recorded for refund review. Contact the hotel; your room is not confirmed.' : 'Your booking is confirmed, but an extra payment requires hotel refund review. Do not pay again; contact the hotel about your credit.' : `Your stay at ${property?.propertyName || 'the hotel'} is confirmed. Keep your reservation code below.`}</p>

        <div className="mb-6 rounded-xl border border-dashed border-primary-200 bg-primary-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Reservation code</p>
          <p className="mt-1 text-2xl font-black uppercase tracking-[0.16em] text-primary-700">{transactionData?.confirmationCode || '—'}</p>
          <p className="mt-1 text-xs text-text-muted">{review ? 'Keep this code when contacting the hotel about your payment.' : 'Show this code at check-in.'}</p>
        </div>

        <div className="mb-6 space-y-3 rounded-lg border border-border bg-background p-4 text-left text-sm">
          <div className="flex justify-between gap-3"><span className="text-text-muted">Amount paid</span><span className="font-bold text-text">GH₵ {(transactionData?.amount / 100).toFixed(2)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-text-muted">Payment method</span><span className="font-semibold text-text">{transactionData?.channel === 'mobile_money' ? 'Mobile Money' : transactionData?.channel === 'card' ? 'Card' : transactionData?.channel || 'Online payment'}</span></div>
        </div>

        <button onClick={() => navigate('/public/reservations')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 font-bold text-text-inverted transition hover:bg-primary-700">
          <CalendarCheck size={18} /> View my reservations
        </button>
      </>, 3);
  }

  // Not confirmed / failed state
  return shell(
    <>
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger-50">
        <XCircle size={34} className="text-danger-600" />
      </div>
      <h1 className="mb-2 text-2xl font-bold text-text">{confirmedFailure ? 'Payment not completed' : 'Payment status not confirmed'}</h1>
      <p className="mb-5 text-text-muted">
        We have not confirmed a successful payment yet. If your bank or Mobile Money account was charged, do not pay again. Check the status or contact the hotel.
      </p>

      <div className="mb-6 space-y-2 rounded-lg border border-primary-100 bg-primary-50/60 p-4 text-left text-sm text-primary-900">
        <p className="flex items-start gap-2 font-semibold"><Clock size={16} className="mt-0.5 shrink-0" /> Your room is held for 10 minutes from when you booked.</p>
        <p className="pl-6">To try again, open <strong>My Reservations</strong> and tap <strong>Pay</strong> on this booking. If the time has run out, choose a room again.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={() => verification.refetch()} disabled={!reference || verification.isFetching} className="flex-1 rounded-lg border border-border py-3 font-bold text-text transition hover:bg-secondary-50 disabled:opacity-50">
          {verification.isFetching ? 'Checking…' : 'Check payment status'}
        </button>
        <button onClick={() => navigate('/public/reservations')} className="flex-1 rounded-lg bg-primary-600 py-3 font-bold text-text-inverted transition hover:bg-primary-700">
          My Reservations · Pay
        </button>
      </div>
    </>, 1, true);
}
