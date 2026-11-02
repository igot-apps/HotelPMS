import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalkInBooking } from './createWalkInBooking.js';

const reservation = { reservationId: 'booking-uuid', confirmationCode: 'RES-TEST' };
const response = { data: { data: reservation } };

test('payment failure returns the saved booking and does not retry reservation creation', async () => {
  let creates = 0;
  const error = new Error('Payment timed out');
  const result = await createWalkInBooking({ initialPayment: 50 }, {
    createReservation: async () => { creates++; return response; },
    recordPayment: async () => { throw error; },
  });
  assert.equal(creates, 1);
  assert.equal(result.reservation, reservation);
  assert.equal(result.paymentError, error);
  assert.equal(result.response, response);
});

test('failed booking never attempts a payment', async () => {
  let payments = 0;
  await assert.rejects(createWalkInBooking({ initialPayment: 50 }, {
    createReservation: async () => { throw new Error('Room no longer available'); },
    recordPayment: async () => { payments++; },
  }), /Room no longer available/);
  assert.equal(payments, 0);
});

test('successful initial payment uses the saved UUID and a numeric amount', async () => {
  let payment;
  const result = await createWalkInBooking({ initialPayment: '50', paymentMethod: 'Cash', propertyId: 1 }, {
    createReservation: async () => response,
    recordPayment: async payload => { payment = payload; },
  });
  assert.equal(payment.reservationId, reservation.reservationId);
  assert.equal(payment.amount, 50);
  assert.equal(result.paymentError, null);
});

test('booking without an initial payment remains successful', async () => {
  let payments = 0;
  const result = await createWalkInBooking({ initialPayment: 0 }, {
    createReservation: async () => response,
    recordPayment: async () => { payments++; },
  });
  assert.equal(payments, 0);
  assert.equal(result.paymentError, null);
  assert.equal(result.reservation, reservation);
});
