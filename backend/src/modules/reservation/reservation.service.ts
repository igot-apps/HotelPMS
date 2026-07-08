import * as reservationRepository from './reservation.repository';
import { findAvailableRooms } from '../room/room.repository';
import { updateGuestLastStay } from '../guest/guest.repository';
import { updateRoomStatus } from '../room/room.repository';

export const createReservation = async (data: any) => {
  // Validate required fields
  if (!data.tenantId) throw new Error('Tenant ID is required');
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.guestId) throw new Error('Guest ID is required');
  if (!data.checkInDate) throw new Error('Check-in date is required');
  if (!data.checkOutDate) throw new Error('Check-out date is required');
  if (!data.rooms || data.rooms.length === 0) {
    throw new Error('At least one room is required');
  }

  const checkIn = new Date(data.checkInDate);
  const checkOut = new Date(data.checkOutDate);

  if (checkIn >= checkOut) {
    throw new Error('Check-in date must be before check-out date');
  }

  // Check availability for all rooms
  for (const roomData of data.rooms) {
    const availableRooms = await findAvailableRooms(
      data.tenantId,
      data.propertyId,
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
        tenantId: data.tenantId,
        propertyId: data.propertyId,
        guestId: data.guestId,
        staffId: data.staffId,
        source: data.source || 'Website',
        checkInDate: checkIn,
        checkOutDate: checkOut,
        status: 'Confirmed',
        notes: data.notes,
        totalAmount,
        
        // 🛡️ ENTERPRISE FIX: Single Source of Truth
        // We IGNORE data.amountPaid here. 
        // The reservation ALWAYS starts at 0 paid.
        // The Payment table will handle all money movement and update these totals atomically.
        amountPaid: 0, 
        balanceDue: totalAmount, 
      });

  // Create reservation rooms
  for (const roomData of data.rooms) {
    await reservationRepository.createReservationRoom({
      tenantId: data.tenantId,
      reservationId: reservation.reservationId,
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
  tenantId: number,
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
    tenantId,
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
  const reservation = await reservationRepository.findReservationById(
    reservationId
  );
  if (!reservation) throw new Error('Reservation not found');
  return reservation;
};

export const updateReservation = async (reservationId: number, data: any) => {
  const reservation = await reservationRepository.findReservationById(
    reservationId
  );
  if (!reservation) throw new Error('Reservation not found');

  // If status is changing to Cancelled, update room statuses
  if (data.status === 'Cancelled' && reservation.status !== 'Cancelled') {
    for (const rr of reservation.reservationRooms) {
      await updateRoomStatus(rr.roomId, 'Available');
    }
  }

  return reservationRepository.updateReservation(reservationId, data);
};

export const cancelReservation = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(
    reservationId
  );
  if (!reservation) throw new Error('Reservation not found');

  if (reservation.status === 'CheckedIn') {
    throw new Error('Cannot cancel a checked-in reservation');
  }

  // Release rooms
  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available');
  }

  return reservationRepository.cancelReservation(reservationId);
};

export const checkInGuest = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(
    reservationId
  );
  if (!reservation) throw new Error('Reservation not found');

  if (reservation.status !== 'Confirmed') {
    throw new Error('Reservation must be confirmed to check in');
  }

  // Update reservation status
  await reservationRepository.updateReservationStatus(reservationId, 'CheckedIn');

  // ✅ FIX: Update room status to Occupied during check-in
  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Occupied');
  }

  // Update guest last stay
  await updateGuestLastStay(reservation.guestId);

  return reservationRepository.findReservationById(reservationId);
};

export const checkOutGuest = async (reservationId: number) => {
  const reservation = await reservationRepository.findReservationById(
    reservationId
  );
  if (!reservation) throw new Error('Reservation not found');

  if (reservation.status !== 'CheckedIn') {
    throw new Error('Reservation must be checked in to check out');
  }

  // Update reservation status
  await reservationRepository.updateReservationStatus(reservationId, 'CheckedOut');

  // Release rooms
  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available', 'Dirty');
    
  }


    // ✅ FIX: Update room status to Available during check-out
  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available');
  }



  return reservationRepository.findReservationById(reservationId);
};

export const getReservationsByDateRange = async (
  tenantId: number,
  propertyId: number,
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from > to) {
    throw new Error('From date must be before to date');
  }

  return reservationRepository.findReservationsByDateRange(
    tenantId,
    propertyId,
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
  const reservation = await reservationRepository.findReservationById(
    reservationId
  );
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