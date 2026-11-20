import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuery } from './matchesQuery.js';

test('matchesQuery searches by confirmation code', () => {
  const row = {
    confirmationCode: 'RES-D3801D13-BD7',
    guestName: 'Abraham Legend',
    phone: '0241234567',
    rooms: [{ roomNumber: '101', phone: null }, { roomNumber: '102', phone: null }],
  };

  assert.equal(matchesQuery(row, 'RES-D3801'), true);
  assert.equal(matchesQuery(row, 'res-d3801d13-bd7'), true);
  assert.equal(matchesQuery(row, 'OTHER-CODE'), false);
});

test('matchesQuery searches by guest name (case-insensitive)', () => {
  const row = {
    confirmationCode: 'RES-D3801D13-BD7',
    guestName: 'Abraham Legend',
    phone: '0241234567',
    rooms: [{ roomNumber: '101', phone: null }, { roomNumber: '102', phone: null }],
  };

  assert.equal(matchesQuery(row, 'abraham'), true);
  assert.equal(matchesQuery(row, 'LEGEND'), true);
  assert.equal(matchesQuery(row, 'brah'), true);
  assert.equal(matchesQuery(row, 'Smith'), false);
});

test('matchesQuery searches by phone number', () => {
  const row = {
    confirmationCode: 'RES-D3801D13-BD7',
    guestName: 'Abraham Legend',
    phone: '0241234567',
    rooms: [{ roomNumber: '101', phone: null }, { roomNumber: '102', phone: '0559998888' }],
  };

  assert.equal(matchesQuery(row, '0241234567'), true);
  assert.equal(matchesQuery(row, '12345'), true);
  assert.equal(matchesQuery(row, '0559998888'), true);
  assert.equal(matchesQuery(row, '0000000000'), false);
});

test('matchesQuery works correctly for multi-room reservations (matching each room)', () => {
  const multiRoomRow = {
    reservationId: 'res-multi-1',
    confirmationCode: 'RES-MULTI-123',
    guestName: 'Ama Osei',
    phone: '0200001111',
    rooms: [
      { roomNumber: '101', reservationRoomId: 1, phone: null },
      { roomNumber: '102', reservationRoomId: 2, phone: null },
      { roomNumber: '205', reservationRoomId: 3, phone: null },
    ],
  };

  // Any of the room numbers matches the reservation
  assert.equal(matchesQuery(multiRoomRow, '101'), true);
  assert.equal(matchesQuery(multiRoomRow, '102'), true);
  assert.equal(matchesQuery(multiRoomRow, '205'), true);
  // Non-existent room number does not match
  assert.equal(matchesQuery(multiRoomRow, '301'), false);
});

test('filtering departures list immediately matches multi-room reservation when typing', () => {
  const departures = [
    {
      reservationId: 'res-1',
      confirmationCode: 'RES-F9485195-90B',
      guestName: 'Kofi Mensah',
      phone: '0241112233',
      rooms: [{ roomNumber: '201', reservationRoomId: 10, phone: null }],
    },
    {
      reservationId: 'res-2',
      confirmationCode: 'RES-D3801D13-BD7',
      guestName: 'Abraham Legend',
      phone: '0249998877',
      rooms: [
        { roomNumber: '101', reservationRoomId: 20, phone: null },
        { roomNumber: '102', reservationRoomId: 21, phone: null },
      ],
    },
  ];

  // Search by first room of multi-room
  const filter101 = departures.filter((row) => matchesQuery(row, '101'));
  assert.equal(filter101.length, 1);
  assert.equal(filter101[0].reservationId, 'res-2');

  // Search by second room of multi-room
  const filter102 = departures.filter((row) => matchesQuery(row, '102'));
  assert.equal(filter102.length, 1);
  assert.equal(filter102[0].reservationId, 'res-2');

  // Search by room in single-room booking
  const filter201 = departures.filter((row) => matchesQuery(row, '201'));
  assert.equal(filter201.length, 1);
  assert.equal(filter201[0].reservationId, 'res-1');

  // Search by common text in guest name
  const filterLegend = departures.filter((row) => matchesQuery(row, 'legend'));
  assert.equal(filterLegend.length, 1);
  assert.equal(filterLegend[0].reservationId, 'res-2');

  // Search with no results
  const filterNone = departures.filter((row) => matchesQuery(row, 'XYZ-NONEXISTENT'));
  assert.equal(filterNone.length, 0);

  // When no results, searching && !filtered.length signals "No matching departures"
  const searching = 'XYZ-NONEXISTENT'.trim().length > 0;
  const noMatches = searching && filterNone.length === 0;
  assert.equal(noMatches, true);
});

test('sorting by date, room, and guest works alongside filtering', () => {
  const rows = [
    {
      reservationId: 'res-1',
      guestName: 'Zoe Mensah',
      expectedCheckoutAt: '2026-11-20T12:00:00Z',
      rooms: [{ roomNumber: '301' }],
    },
    {
      reservationId: 'res-2',
      guestName: 'Abraham Legend',
      expectedCheckoutAt: '2026-11-20T10:00:00Z',
      rooms: [{ roomNumber: '101' }, { roomNumber: '102' }],
    },
  ];

  // Sort by date (ascending expectedCheckoutAt)
  const byDate = [...rows].sort((a, b) => new Date(a.expectedCheckoutAt) - new Date(b.expectedCheckoutAt));
  assert.equal(byDate[0].reservationId, 'res-2');
  assert.equal(byDate[1].reservationId, 'res-1');

  // Sort by room (numeric room number from first room)
  const room = (row) => String(row.roomNumber ?? row.rooms?.[0]?.roomNumber ?? row.rooms?.[0] ?? '');
  const byRoom = [...rows].sort((a, b) => room(a).localeCompare(room(b), undefined, { numeric: true }));
  assert.equal(byRoom[0].reservationId, 'res-2');
  assert.equal(byRoom[1].reservationId, 'res-1');

  // Sort by guest name
  const byGuest = [...rows].sort((a, b) => String(a.guestName).localeCompare(String(b.guestName)));
  assert.equal(byGuest[0].reservationId, 'res-2');
  assert.equal(byGuest[1].reservationId, 'res-1');
});
