// A saved reservation remains a success even if its separate initial payment fails.
export async function createWalkInBooking(payload, { createReservation, recordPayment }) {
  const response = await createReservation(payload);
  const reservation = response.data.data;
  let paymentError = null;
  if (payload.initialPayment > 0.01) {
    try {
      await recordPayment({
        reservationId: reservation.reservationId,
        amount: Number(payload.initialPayment),
        paymentMethod: payload.paymentMethod,
        propertyId: payload.propertyId,
        gatewayReference: payload.gatewayReference || null,
        notes: 'Initial payment for reservation',
      });
    } catch (error) {
      paymentError = error;
    }
  }
  return { response, reservation, paymentError };
}
