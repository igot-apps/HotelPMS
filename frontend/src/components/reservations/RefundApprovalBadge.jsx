import { Link } from 'react-router-dom';
export default function RefundApprovalBadge({ reservation }) {
  const requests = reservation.correctionRequests || [];
  const approved = requests.filter(r => r.status === 'Approved');
  const pendingRequests = requests.filter(r => r.status === 'Pending');
  const pending = pendingRequests.length > 0;
  const simulationOnly = pending && pendingRequests.every(r => r.input.mode === 'SimulatedMoMo');
  if (!approved.length && !pending) return null;
  const amount = approved.reduce((sum,r) => sum + Number(r.input.amount), 0);
  return <Link to={`/reservations/${reservation.reservationId}#refunds`} className={`mt-2 inline-flex max-w-full rounded-lg border px-2 py-1 text-xs font-semibold ${approved.length ? 'border-primary-200 bg-primary-50 text-primary-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{approved.length ? `Refund approved · GHS ${amount.toFixed(2)} ready to return` : simulationOnly ? 'MoMo simulation awaiting approval' : 'Refund awaiting approval'}</Link>;
}
