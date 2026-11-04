import * as reservationRepository from './reservation.repository';
import * as recovery from './recovery.service';

import { createHotelReservation } from './booking-creation.service';

export const createReservation = (data: any) => createHotelReservation(data);

export const getReservations = async (
  filters: {
    propertyId?: number;
    propertyGuestId?: number;
    platformGuestId?: number;
    search?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  },
  page: number = 1,
  limit: number = 10
) => {
  const fromDate = filters.fromDate ? new Date(filters.fromDate) : undefined;
  const toDate = filters.toDate ? new Date(filters.toDate) : undefined;
  
  return reservationRepository.findReservations(
    {
      propertyId: filters.propertyId,
      propertyGuestId: filters.propertyGuestId,
      platformGuestId: filters.platformGuestId,
      search: filters.search,
      status: filters.status,
      fromDate,
      toDate,
    },
    page,
    limit
  );
};

export const getReservationById = async (reservationId: string) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  return reservation;
};

export const updateReservation = async (reservationId: string, data: any) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  const allowed = { notes: data.notes, source: data.source };
  if (Object.keys(data).some(key => !['notes', 'source'].includes(key))) throw new Error('Use the dedicated reservation or manager correction actions.');
  return reservationRepository.updateReservation(reservationId, allowed);
};

// 🌟 PERFECT: Auto-flags reservation for refund if money was paid
export const cancelReservation = (reservationId: string, actor: recovery.Actor, reason?: string) =>
  recovery.cancelSafely(reservationId, actor, reason);

export const checkInGuest = (reservationId: string, actor: recovery.Actor) => recovery.checkinBooking(reservationId, actor);

export const checkOutGuest = (reservationId: string, actor: recovery.Actor, overrideReason?: unknown) =>
  recovery.checkoutBooking(reservationId, actor, overrideReason);

export const getReservationsByDateRange = async (
  propertyId: number,
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (from > to) {
    throw new Error('From date must be before to date');
  }
  return reservationRepository.findReservationsByDateRange(propertyId, from, to);
};

export const getReservationStats = async (reservationId: string) => {
  const stats = await reservationRepository.getReservationStats(reservationId);
  if (!stats) throw new Error('Reservation not found');
  return stats;
};

export const updateReservationFinancials = async (
  reservationId: string,
  amountPaid: number
) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  const totalAmount = Number(reservation.totalAmount || 0);
  const newAmountPaid = Number(reservation.amountPaid || 0) + amountPaid;
  if (newAmountPaid > totalAmount) {
    throw new Error('Amount paid cannot exceed total amount');
  }
  return reservationRepository.updateReservationFinancials(
    reservationId,
    totalAmount,
    newAmountPaid
  );
};

export const updateReservationRoomStatus = (
  reservationRoomId: number, status: string, occupantName: string | undefined,
  occupantPhone: string | undefined, actor: recovery.Actor, overrideReason?: unknown, duplicateOccupantConfirmation?: unknown,
) => recovery.transitionStay(reservationRoomId, status, actor, { occupantName, occupantPhone, overrideReason, duplicateOccupantConfirmation });

export const extendReservationRoom = async (reservationRoomId: number, newCheckOutDate: string, actor: recovery.Actor) => {
  const stay = await reservationRepository.findReservationRoomById(reservationRoomId);
  if (!stay || stay.reservation.propertyId !== actor.propertyId) throw new Error('Reservation room not found for this hotel.');
  if (new Date(newCheckOutDate) <= stay.checkOutDate) throw new Error('New departure must be after the current departure. Use manager corrections to shorten a stay.');
  const input = { action: 'correct-date', stayId: reservationRoomId, newCheckOutDate, reason: 'Guest requested a stay extension' };
  const preview = await recovery.correctBooking(stay.reservationId, actor, { ...input, preview: true });
  return recovery.correctBooking(stay.reservationId, actor, { ...input, expectedVersion: preview.version });
};

export const updateGuestPresence = async (
  reservationRoomId: number,
  action: 'out' | 'returned',
  userId: number,
  propertyId: number,
  expectedReturnAt?: string
) => {
  if (action !== 'out' && action !== 'returned') throw new Error('Invalid guest presence action.');

  let expectedReturn: Date | undefined;
  if (expectedReturnAt) {
    expectedReturn = new Date(expectedReturnAt);
    if (Number.isNaN(expectedReturn.getTime()) || expectedReturn <= new Date()) {
      throw new Error('Expected return time must be in the future.');
    }
  }
  if (action === 'returned' && expectedReturnAt) {
    throw new Error('An expected return time can only be set when marking a guest out.');
  }

  return reservationRepository.updateGuestPresence(
    reservationRoomId,
    action,
    userId,
    propertyId,
    expectedReturn
  );
};

export const markAsNoShow = async (reservationId: string, userPropertyId?: number) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  
  if (userPropertyId && reservation.propertyId !== userPropertyId) {
    throw new Error('You do not have access to this reservation');
  }

  if (reservation.status !== 'Confirmed') {
    throw new Error(`Cannot mark as no-show. Reservation is currently "${reservation.status}". Only "Confirmed" reservations can be marked as no-show.`);
  }

  // Scheduled stay dates are calendar dates; compare against today's date in
  // the hotel's timezone rather than the server's or receptionist's timezone.
  const checkIn = new Date(reservation.checkInDate);
  if (Number.isNaN(checkIn.getTime())) throw new Error('The reservation has an invalid arrival date.');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: reservation.property.timezone || 'Africa/Accra',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const arrivalDate = checkIn.toISOString().slice(0, 10);
  if (arrivalDate > today) {
    throw new Error(`Cannot mark as no-show before the arrival date (${arrivalDate}).`);
  }

  const hasCheckedInRoom = reservation.reservationRooms.some(r => r.status === 'CheckedIn');
  if (hasCheckedInRoom) {
    throw new Error('Cannot mark as no-show. At least one room is already checked in.');
  }

  return reservationRepository.markReservationAsNoShow(reservationId);
};

// ============================================================
// 🌟 NEW: REFUND A CANCELLED RESERVATION
// ============================================================
export const refundReservation = async (_reservationId: string): Promise<never> => { throw new Error('Use refund requests, manager approval, and money-return recording.'); };
