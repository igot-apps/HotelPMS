import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingStatusLabel } from './statusLabels.js';

test('a booking with checked-out and expired rooms reads Completed; otherwise unchanged', () => {
  assert.equal(bookingStatusLabel('Completed', [{ status: 'CheckedOut' }, { status: 'NoShow' }]), 'Completed');
  assert.equal(bookingStatusLabel('Completed', [{ status: 'CheckedOut' }]), 'Checked out');
  assert.equal(bookingStatusLabel('Completed'), 'Checked out');
  assert.equal(bookingStatusLabel('NoShow', [{ status: 'NoShow' }]), 'Expired');
});
