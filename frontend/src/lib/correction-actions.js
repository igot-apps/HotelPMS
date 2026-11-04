export const correctionLabels = { refund: 'Refund payment', 'undo-checkin': 'Undo mistaken check-in', 'undo-checkout': 'Undo mistaken checkout', restore: 'Restore cancelled reservation', transfer: 'Transfer guest to another room', 'correct-date': 'Correct departure date and charges', 'correct-payment': 'Correct or void a manual payment', 'credit-checkout': 'Checkout with outstanding balance' };
export function invalidateCorrections(client) {
  for (const key of ['correctionRequests', 'refunds', 'dailyOverview', 'reservation', 'reservationStats', 'reservationCorrections', 'reservations', 'rooms', 'availability', 'payments', 'calendarReservations', 'operationalOverview', 'transferRooms']) client.invalidateQueries({ queryKey: [key] });
}

export function approvalStatusLabel(request) {
  if (request.action !== 'refund') return request.status;
  if (request.status === 'Simulated' && !request.input?.simulation?.balancesApplied) return 'Simulation preview only';
  return {Pending: 'Awaiting approval', Approved: 'Approved · money still to return', Completed: 'Refund completed', Simulated: 'Sent (simulation)', Rejected: 'Refund rejected', Withdrawn: 'Request withdrawn'}[request.status] || request.status;
}
