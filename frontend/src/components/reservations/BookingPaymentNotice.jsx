import { Link } from 'react-router-dom';

export default function BookingPaymentNotice({ reservation, onDismiss }) {
  if (!reservation) return null;
  return (
    <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <p className="font-semibold">Reservation {reservation.confirmationCode || reservation.reservationId} was saved.</p>
      <p className="mt-1 text-sm">The initial payment could not be confirmed. Open this reservation and review its payment history before recording it again. Do not create another booking.</p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link to={`/reservations/${reservation.reservationId}`} className="underline">Review reservation &amp; payments</Link>
        <button type="button" onClick={onDismiss}>Dismiss</button>
      </div>
    </section>
  );
}
