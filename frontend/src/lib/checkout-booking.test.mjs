import test from 'node:test';
import assert from 'node:assert/strict';
import { reusableCheckoutBooking } from './checkout-booking.mjs';

const saved = { key: 'hotel:room:dates:guest', reservationId: 'old-booking' };
test('released checkout is discarded so the same room and dates can be booked again', async () => {
  assert.equal(await reusableCheckoutBooking(saved, saved.key, async id => {
    assert.equal(id, 'old-booking'); return { status: 'released' };
  }), null);
});
test('active, uncertain, and paid checkouts are retained to avoid duplicate bookings', async () => {
  for (const status of ['pending', 'unknown', 'unpaid', 'paid']) {
    assert.equal(await reusableCheckoutBooking(saved, saved.key, async () => ({ status })), saved);
  }
});
test('status failures preserve duplicate prevention rather than authorizing a new booking', async () => {
  await assert.rejects(reusableCheckoutBooking(saved, saved.key, async () => { throw new Error('Offline'); }), /Offline/);
});
test('unrelated dates or guests do not reuse a saved booking', async () => {
  assert.equal(await reusableCheckoutBooking(saved, 'other', async () => { throw new Error('Must not check another booking'); }), null);
});
