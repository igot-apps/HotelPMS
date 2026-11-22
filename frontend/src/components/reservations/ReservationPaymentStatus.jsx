import { Check, CircleDollarSign } from 'lucide-react';
import RefundPaymentSummary from './RefundPaymentSummary';

const money = (value) => `GHS ${Number(value || 0).toFixed(2)}`;

// One financial-status display for staff-facing reservation cards, rows and details.
export default function ReservationPaymentStatus({ reservation, align = 'left', showTotal = false, compact = false }) {
  const closed = ['Cancelled', 'Expired', 'NoShow'].includes(reservation?.status);
  const refunds = reservation?.refunds || [];
  const returned = refunds.filter((refund) => !refund.isSimulated).reduce((sum, refund) => sum + Number(refund.amount || 0), 0)
    + (reservation?.payments || []).filter((payment) => payment.status === 'Refunded').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const simulated = refunds.filter((refund) => refund.isSimulated).reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  if (closed) return <RefundPaymentSummary returned={returned} remaining={reservation?.refundDue} paid={reservation?.amountPaid} requests={reservation?.correctionRequests} simulated={simulated} align={align} />;

  const total = Number(reservation?.totalAmount || 0);
  const paid = Number(reservation?.amountPaid || 0);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const credit = Math.max(Number(reservation?.refundDue || 0), Math.round((paid - total) * 100) / 100, 0);
  const justify = align === 'right' ? 'items-end text-right' : 'items-start text-left';

  return <div className={`flex min-w-0 flex-col ${justify} ${compact ? 'gap-0.5' : 'gap-1'}`}>
    {showTotal && <span className="text-xs text-text-muted">Total {money(total)}</span>}
    {balance > 0.01 ? <span className="inline-flex items-center gap-1 rounded-md border border-danger-200 bg-danger-50 px-2 py-1 text-xs font-bold text-danger-700"><CircleDollarSign size={13} /> Owes: {money(balance)}</span>
      : credit > 0.01 ? <span className="inline-flex rounded-md border border-warning-200 bg-warning-50 px-2 py-1 text-xs font-bold text-warning-800">Credit to refund: {money(credit)}</span>
      : <span className="inline-flex items-center gap-1 rounded-md border border-success-200 bg-success-50 px-2 py-1 text-xs font-bold text-success-700"><Check size={13} /> Paid in full</span>}
    {balance > 0.01 && paid <= 0.01 && <span className="text-xs text-text-muted">No payment collected</span>}
  </div>;
}
