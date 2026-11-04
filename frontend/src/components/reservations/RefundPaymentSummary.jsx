export default function RefundPaymentSummary({ returned, remaining, requests = [], simulated = 0, align = 'left' }) {
  const returnedCents = Math.max(0, Math.round(Number(returned || 0) * 100));
  const remainingCents = Math.max(0, Math.round(Number(remaining || 0) * 100));
  const latestSimulation = requests.find(request => request.status === 'Simulated' && request.input?.mode === 'SimulatedMoMo' && request.input?.simulation?.moneySent === false && request.input?.simulation?.balancesApplied === true);
  const simulatedCents = Math.max(0, Math.round(Number(simulated || latestSimulation?.input.amount || 0) * 100));
  const simulationOnly = simulatedCents > 0 && returnedCents === 0;
  const partial = returnedCents > 0 && remainingCents > 0;
  const label = simulationOnly ? remainingCents > 0 ? 'Partially sent (simulation)' : 'Sent (simulation)' : partial ? 'Partially refunded' : remainingCents > 0 ? 'Refund due' : returnedCents > 0 ? 'Refunded' : 'No payment collected';
  const color = simulationOnly ? 'border-primary-200 bg-primary-50 text-primary-800' : remainingCents > 0 ? 'border-warning-200 bg-warning-50 text-warning-700' : returnedCents > 0 ? 'border-success-200 bg-success-50 text-success-700' : 'border-border bg-secondary-50 text-text-muted';
  return <div className={`min-w-0 space-y-1 text-sm ${align === 'right' ? 'text-right' : ''}`}><span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>{simulatedCents > 0 && <p className="text-xs text-primary-800">GHS {(simulatedCents / 100).toFixed(2)} sent in simulation</p>}{returnedCents > 0 && <p className="text-success-700"><strong>GHS {(returnedCents / 100).toFixed(2)}</strong> returned</p>}{remainingCents > 0 && <p className="text-text">{simulationOnly ? 'Test refund remaining: ' : ''}<strong>GHS {(remainingCents / 100).toFixed(2)}</strong>{simulationOnly ? '' : ' remaining'}</p>}</div>;
}
