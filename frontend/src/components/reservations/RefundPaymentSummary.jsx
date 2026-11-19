// Payment summary for cancelled / expired bookings. `paid` is the money the hotel still holds for the
// booking (amount paid after refunds); part of it may still be due back (`remaining`), the rest is kept.
export default function RefundPaymentSummary({ returned, remaining, paid, requests = [], simulated = 0, align = 'left' }) {
  const returnedCents = Math.max(0, Math.round(Number(returned || 0) * 100));
  const remainingCents = Math.max(0, Math.round(Number(remaining || 0) * 100));
  const keptCents = paid === undefined ? 0 : Math.max(0, Math.round(Number(paid || 0) * 100) - remainingCents);
  const latestSimulation = requests.find(request => request.status === 'Simulated' && request.input?.mode === 'SimulatedMoMo' && request.input?.simulation?.moneySent === false && request.input?.simulation?.balancesApplied === true);
  const simulatedCents = Math.max(0, Math.round(Number(simulated || latestSimulation?.input.amount || 0) * 100));
  const simulationOnly = simulatedCents > 0 && returnedCents === 0;
  const partial = returnedCents > 0 && remainingCents > 0;
  const label = simulationOnly ? remainingCents > 0 ? 'Partially sent (simulation)' : 'Sent (simulation)'
    : partial ? 'Partially refunded'
    : remainingCents > 0 ? 'Refund due'
    : keptCents > 0 ? returnedCents > 0 ? 'Partly refunded · rest kept' : 'Kept · not refunded'
    : returnedCents > 0 ? 'Refunded'
    : 'No payment collected';
  const color = simulationOnly ? 'border-primary-200 bg-primary-50 text-primary-800'
    : remainingCents > 0 ? 'border-warning-200 bg-warning-50 text-warning-700'
    : keptCents > 0 ? 'border-primary-200 bg-primary-50 text-primary-700'
    : returnedCents > 0 ? 'border-success-200 bg-success-50 text-success-700'
    : 'border-border bg-secondary-50 text-text-muted';
  const ghs = (cents) => `GHS ${(cents / 100).toFixed(2)}`;
  return <div className={`min-w-0 space-y-1 text-sm ${align === 'right' ? 'text-right' : ''}`}>
    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    {simulatedCents > 0 && <p className="text-xs text-primary-800">{ghs(simulatedCents)} sent in simulation</p>}
    {returnedCents > 0 && <p className="text-success-700"><strong>{ghs(returnedCents)}</strong> returned</p>}
    {remainingCents > 0 && <p className="text-text">{simulationOnly ? 'Test refund remaining: ' : ''}<strong>{ghs(remainingCents)}</strong>{simulationOnly ? '' : ' remaining'}</p>}
    {keptCents > 0 && <p className="text-text"><strong>{ghs(keptCents)}</strong> kept by hotel</p>}
  </div>;
}
