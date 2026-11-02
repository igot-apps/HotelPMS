// Check the server before reusing a saved checkout. A failed status request
// must propagate: uncertainty is not permission to create a duplicate booking.
export async function reusableCheckoutBooking(saved, key, checkStatus) {
  if (saved?.key !== key || !saved.reservationId) return null;
  const status = await checkStatus(saved.reservationId);
  return status.status === 'released' ? null : saved;
}
