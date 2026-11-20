import test from 'node:test';
import assert from 'node:assert/strict';
import { _resetForTests, deviceClockOffset, recordServerTime, serverNow, setResync } from './serverClock.js';
import { hotelToday } from './period.js';
import { expectedCheckoutAt, fromHotelInput, noShowAllowedFrom, noShowRooms, toHotelInput } from './stayTiming.js';

const H = 3600000;
const SERVER = Date.UTC(2026, 10, 20, 21, 0, 0); // 21:00 Ghana (UTC+0), 20 Nov
const header = (ms) => new Date(ms).toUTCString();

// Fake clocks: `perf` is monotonic, `device` is the computer's (possibly wrong) wall clock.
function setup(deviceOffset = 0) {
  const t = { perf: 1000, device: SERVER + deviceOffset };
  _resetForTests({ perf: () => t.perf, device: () => t.device });
  const advance = (ms) => { t.perf += ms; t.device += ms; };
  return { t, advance };
}

for (const [label, offset] of [['3 hours ahead', 3 * H], ['3 hours behind', -3 * H], ['correct', 0]]) {
  test(`device clock ${label}: server time is used`, () => {
    setup(offset);
    assert.equal(serverNow(), null, 'unknown before the first response');
    assert.equal(hotelToday(), null);
    assert.ok(recordServerTime(header(SERVER), 1000));
    assert.ok(Math.abs(serverNow().getTime() - SERVER) <= 1000);
    assert.equal(hotelToday(), '2026-11-20');
    assert.ok(Math.abs(deviceClockOffset() + offset) <= 1000);
  });
}

test('invalid or missing Date headers are ignored', () => {
  setup();
  for (const bad of [undefined, '', 'nonsense', header(Date.UTC(1999, 0, 1)), header(Date.UTC(2150, 0, 1))]) assert.equal(recordServerTime(bad, 1000), false);
  assert.equal(serverNow(), null);
});

test('changing the PC clock mid-session: stops trusting, resyncs, then exact again', () => {
  const { t, advance } = setup();
  let resyncs = 0;
  setResync(() => { resyncs += 1; });
  recordServerTime(header(SERVER), 1000);
  advance(10 * 60000);
  assert.ok(Math.abs(serverNow().getTime() - (SERVER + 10 * 60000)) <= 1000);
  t.device += 5 * H; // receptionist moves the clock forward
  assert.equal(serverNow(), null, 'time-based rules pause instead of using the changed clock');
  assert.equal(resyncs, 1);
  serverNow(); assert.equal(resyncs, 1, 'resync is throttled');
  recordServerTime(header(SERVER + 10 * 60000), t.perf);
  assert.ok(Math.abs(serverNow().getTime() - (SERVER + 10 * 60000)) <= 1000);
});

test('network down: keeps counting from the last server time', () => {
  const { advance } = setup(-3 * H);
  recordServerTime(header(SERVER), 1000);
  advance(2 * H); // no responses for two hours
  assert.ok(Math.abs(serverNow().getTime() - (SERVER + 2 * H)) <= 1000);
});

test('older (cached) Date header does not move the clock back', () => {
  const { advance } = setup();
  recordServerTime(header(SERVER), 1000);
  advance(60000);
  recordServerTime(header(SERVER - 30000), 1000);
  assert.ok(serverNow().getTime() >= SERVER + 60000);
});

test('Ghana midnight rollover follows server time, not the PC', () => {
  const { advance } = setup(5 * H); // PC already thinks it is tomorrow
  recordServerTime(header(Date.UTC(2026, 10, 20, 23, 59, 0)), 1000);
  assert.equal(hotelToday(), '2026-11-20');
  advance(2 * 60000);
  assert.equal(hotelToday(), '2026-11-21');
});

test('no-show eligibility and late checkout use hotel time, whatever the PC zone', () => {
  // Arrival 20 Nov, check-in 14:00 Accra -> no-show from 20:00 Accra (UTC 20:00)
  assert.equal(noShowAllowedFrom('2026-11-20', '14:00').toISOString(), '2026-11-20T20:00:00.000Z');
  assert.equal(expectedCheckoutAt('2026-11-21', '11:00').toISOString(), '2026-11-21T11:00:00.000Z');
  const res = { status: 'InHouse', property: { checkInTime: '14:00', timezone: 'Africa/Accra' }, reservationRooms: [
    { reservationRoomId: 1, status: 'Reserved', checkInDate: '2026-11-20' },
    { reservationRoomId: 2, status: 'CheckedIn', checkInDate: '2026-11-20' },
    { reservationRoomId: 3, status: 'Reserved', checkInDate: '2026-11-21' },
  ] };
  assert.deepEqual(noShowRooms(res, Date.UTC(2026, 10, 20, 19, 59)).map((r) => r.reservationRoomId), []);
  assert.deepEqual(noShowRooms(res, Date.UTC(2026, 10, 20, 20, 0)).map((r) => r.reservationRoomId), [1]);
  assert.deepEqual(noShowRooms(res, null), [], 'unknown server time: nothing eligible');
});

test('departure and refund times are entered and sent in hotel time', () => {
  const moment = new Date(Date.UTC(2026, 10, 20, 9, 30, 15));
  assert.equal(toHotelInput(moment), '2026-11-20T09:30');
  assert.equal(toHotelInput(moment, undefined, true), '2026-11-20T09:30:15');
  assert.equal(fromHotelInput('2026-11-20T09:30:15').toISOString(), '2026-11-20T09:30:15.000Z');
  assert.equal(fromHotelInput('2026-11-20T09:30', 'Africa/Lagos').toISOString(), '2026-11-20T08:30:00.000Z');
  assert.equal(toHotelInput(null), '');
  assert.equal(fromHotelInput(''), null);
});
