import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import * as repository from '../src/modules/reservation/reservation.repository';
import { markAsNoShow } from '../src/modules/reservation/reservation.service';

jest.mock('../src/modules/reservation/reservation.repository', () => ({
  findReservationById: jest.fn(), markReservationAsNoShow: jest.fn(),
}));
jest.mock('../src/modules/room/room.repository', () => ({}));
jest.mock('../src/modules/guest/guest.repository', () => ({}));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {} }));

const fixture = (overrides = {}) => ({
  propertyId: 1, status: 'Confirmed', checkInDate: new Date('2026-11-02T00:00:00Z'),
  property: { timezone: 'Africa/Accra' }, reservationRooms: [{ status: 'Reserved' }], ...overrides,
});
beforeEach(() => {
  jest.resetAllMocks(); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-01T12:00:00Z'));
});
afterEach(() => { jest.useRealTimers(); });

describe('no-show arrival-date guard', () => {
  it('rejects future arrivals without updating the reservation', async () => {
    (repository.findReservationById as any).mockResolvedValue(fixture());
    await expect(markAsNoShow('booking', 1)).rejects.toThrow('from 20:00 on 2026-11-02');
    expect(repository.markReservationAsNoShow).not.toHaveBeenCalled();
  });
  it('waits until check-in time plus grace on the arrival day (14:00 + 6 h)', async () => {
    (repository.findReservationById as any).mockResolvedValue(fixture({ checkInDate: new Date('2026-11-01'), property: { timezone: 'Africa/Accra', checkInTime: '14:00' } }));
    await expect(markAsNoShow('booking', 1)).rejects.toThrow('The guest can still arrive');
    jest.setSystemTime(new Date('2026-11-01T20:00:00Z'));
    await markAsNoShow('booking', 1, 7, '  Phone   unreachable ');
    expect(repository.markReservationAsNoShow).toHaveBeenCalledWith('booking', 7, 'Phone unreachable');
  });
  it('allows any time after the arrival day', async () => {
    (repository.findReservationById as any).mockResolvedValue(fixture({ checkInDate: new Date('2026-10-31') }));
    await markAsNoShow('booking', 1);
    expect(repository.markReservationAsNoShow).toHaveBeenCalledWith('booking', undefined, '');
  });
  it('uses the hotel time zone instead of the server clock', async () => {
    jest.setSystemTime(new Date('2026-11-02T11:30:00Z')); // 20:30 in Tokyo on 2 November
    (repository.findReservationById as any).mockResolvedValue(fixture({ property: { timezone: 'Asia/Tokyo' } }));
    await markAsNoShow('booking', 1);
    expect(repository.markReservationAsNoShow).toHaveBeenCalled();
    (repository.findReservationById as any).mockResolvedValue(fixture());
    await expect(markAsNoShow('booking', 1)).rejects.toThrow('The guest can still arrive');
  });
  it('retains ownership, confirmed-status, and checked-in-room protections', async () => {
    for (const reservation of [fixture({ propertyId: 2 }), fixture({ status: 'Cancelled' }),
      fixture({ checkInDate: new Date('2026-11-01'), reservationRooms: [{ status: 'CheckedIn' }] })]) {
      (repository.findReservationById as any).mockResolvedValue(reservation);
      await expect(markAsNoShow('booking', 1)).rejects.toThrow();
    }
    expect(repository.markReservationAsNoShow).not.toHaveBeenCalled();
  });
  it('rejects corrupt arrival dates without modifying data', async () => {
    (repository.findReservationById as any).mockResolvedValue(fixture({ checkInDate: new Date('invalid') }));
    await expect(markAsNoShow('booking', 1)).rejects.toThrow('invalid arrival date');
    expect(repository.markReservationAsNoShow).not.toHaveBeenCalled();
  });
});
