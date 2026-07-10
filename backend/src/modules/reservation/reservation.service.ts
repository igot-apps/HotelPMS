import * as reservationRepository from './reservation.repository';
import { findAvailableRooms } from '../room/room.repository';
import { updateGuestLastStay } from '../guest/guest.repository';
import { updateRoomStatus } from '../room/room.repository';

export const createReservation = async (data: any) => {
  // Validate required fields
  if (!data.propertyId) throw new Error('Property ID is required'); // ✅ Removed tenantId check
  if (!data.guestId) throw new Error('Guest ID is required');
  if (!data.checkInDate) throw new Error('Check-in date is required');
  if (!data.checkOutDate) throw new Error('Check-out date is required');
  if (!data.rooms || data.rooms.length === 0) {
    throw new Error('At least one room is required');
  }

  // 🚨 1. NORMALIZE DATES TO MIDNIGHT
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkIn = new Date(data.checkInDate);
  checkIn.setHours(0, 0, 0, 0);
  const checkOut = new Date(data.checkOutDate);
  checkOut.setHours(0, 0, 0, 0);

  // 🚨 2. PREVENT PAST DATES
  if (checkIn < today) {
    throw new Error('Check-in date cannot be in the past. For walk-ins, please select today\'s date.');
  }

  // 🚨 3. VALIDATE STAY LENGTH
  if (checkIn >= checkOut) {
    throw new Error('Check-out date must be at least one day after the check-in date.');
  }

  // Check availability for all rooms
  for (const roomData of data.rooms) {
    const availableRooms = await findAvailableRooms(
      data.propertyId, // ✅ Removed tenantId
      checkIn,
      checkOut,
      roomData.roomTypeId
    );

    const roomExists = availableRooms.some(r => r.roomId === roomData.roomId);
    if (!roomExists) {
      throw new Error(`Room ${roomData.roomId} is not available for the selected dates`);
    }
  }

  // Calculate total amount
  const nights = Math.ceil(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
  );

  let totalAmount = 0;
  for (const roomData of data.rooms) {
    totalAmount += roomData.agreedPricePerNight * nights;
  }

  // Create reservation
  const reservation = await reservationRepository.createReservation({
    propertyId: data.propertyId, // ✅ Removed tenantId
    guestId: data.guestId,
    staffId: data.staffId,
    source: data.source || 'Website',
    checkInDate: checkIn,
    checkOutDate: checkOut,
    status: 'Confirmed',
    notes: data.notes,
    totalAmount,
    amountPaid: 0, 
    balanceDue: totalAmount, 
  });

  // Create reservation rooms
  for (const roomData of data.rooms) {
    await reservationRepository.createReservationRoom({
      reservationId: reservation.reservationId, // ✅ Removed tenantId
      roomId: roomData.roomId,
      roomTypeId: roomData.roomTypeId,
      ratePlanId: roomData.ratePlanId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      agreedPricePerNight: roomData.agreedPricePerNight,
    });
  }

  return reservationRepository.findReservationById(reservation.reservationId);
};

export const getReservations = async (
  filters: {
    propertyId?: number;
    guestId?: number;
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
      guestId: filters.guestId,
      status: filters.status,
      fromDate,
      toDate,
    },
    page,
    limit
  );
};

export const getReservationById = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  return reservation;
};

export const updateReservation = async (reservationId: number, data: any) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');

  if (data.status === 'Cancelled' && reservation.status !== 'Cancelled') {
    for (const rr of reservation.reservationRooms) {
      await updateRoomStatus(rr.roomId, 'Available');
    }
  }

  return reservationRepository.updateReservation(reservationId, data);
};

export const cancelReservation = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.status === 'CheckedIn') {
    throw new Error('Cannot cancel a checked-in reservation');
  }

  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available');
  }

  return reservationRepository.cancelReservation(reservationId);
};

export const checkInGuest = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.status !== 'Confirmed') {
    throw new Error('Reservation must be confirmed to check in');
  }

  await reservationRepository.updateReservationStatus(reservationId, 'CheckedIn');

  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Occupied');
  }

  await updateGuestLastStay(reservation.guestId);

  return reservationRepository.findReservationById(reservationId);
};

export const checkOutGuest = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.status !== 'CheckedIn') {
    throw new Error('Reservation must be checked in to check out');
  }

  await reservationRepository.updateReservationStatus(reservationId, 'CheckedOut');

  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available', 'Dirty');
  }

  return reservationRepository.findReservationById(reservationId);
};

export const getReservationsByDateRange = async (
  propertyId: number, // ✅ Removed tenantId
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from > to) {
    throw new Error('From date must be before to date');
  }

  return reservationRepository.findReservationsByDateRange(
    propertyId, // ✅ Removed tenantId
    from,
    to
  );
};

export const getReservationStats = async (reservationId: number) => {
  const stats = await reservationRepository.getReservationStats(reservationId);
  if (!stats) throw new Error('Reservation not found');
  return stats;
};

export const updateReservationFinancials = async (
  reservationId: number,
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