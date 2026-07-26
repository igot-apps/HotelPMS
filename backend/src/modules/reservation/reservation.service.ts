import * as reservationRepository from './reservation.repository';
import { findAvailableRooms, updateRoomStatus } from '../room/room.repository';
import { updateGuestLastStay } from '../guest/guest.repository';

// 🌟 HELPER: Generate a short, easy-to-read confirmation code (e.g., "RES-8X9K2P")
const generateConfirmationCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omitted 0, O, 1, I to avoid confusion
  let code = 'RES-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const createReservation = async (data: any) => {
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.propertyGuestId && !data.platformGuestId) {
    throw new Error('Either Property Guest ID or Platform Guest ID is required');
  }
  if (!data.checkInDate) throw new Error('Check-in date is required');
  if (!data.checkOutDate) throw new Error('Check-out date is required');
  if (!data.rooms || data.rooms.length === 0) {
    throw new Error('At least one room is required');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkIn = new Date(data.checkInDate);
  checkIn.setHours(0, 0, 0, 0);
  const checkOut = new Date(data.checkOutDate);
  checkOut.setHours(0, 0, 0, 0);

  if (checkIn < today) {
    throw new Error('Check-in date cannot be in the past. For walk-ins, please select today\'s date.');
  }
  if (checkIn >= checkOut) {
    throw new Error('Check-out date must be at least one day after the check-in date.');
  }

  for (const roomData of data.rooms) {
    const availableRooms = await findAvailableRooms(
      data.propertyId,
      checkIn,
      checkOut,
      roomData.roomTypeId
    );
    const roomExists = availableRooms.some((r: any) => r.roomId === roomData.roomId);
    if (!roomExists) {
      throw new Error(`Room ${roomData.roomId} is not available for the selected dates`);
    }
  }

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  let totalAmount = 0;
  for (const roomData of data.rooms) {
    totalAmount += roomData.agreedPricePerNight * nights;
  }

  const reservation = await reservationRepository.createReservation({
    propertyId: data.propertyId,
    propertyGuestId: data.propertyGuestId || null,
    platformGuestId: data.platformGuestId || null,
    staffId: data.staffId,
    source: data.source || 'Website',
    checkInDate: checkIn,
    checkOutDate: checkOut,
    status: 'Confirmed',
    notes: data.notes,
    totalAmount,
    amountPaid: 0,
    confirmationCode: generateConfirmationCode(), // 🌟 ADDED: Generates short code
  });

  for (const roomData of data.rooms) {
    await reservationRepository.createReservationRoom({
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

export const getReservationById = async (reservationId: string) => { // 🌟 CHANGED TO STRING
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  return reservation;
};

export const updateReservation = async (reservationId: string, data: any) => { // 🌟 CHANGED TO STRING
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (data.status === 'Cancelled' && reservation.status !== 'Cancelled') {
    for (const rr of reservation.reservationRooms) {
      await updateRoomStatus(rr.roomId, 'Available');
    }
  }
  return reservationRepository.updateReservation(reservationId, data);
};

export const cancelReservation = async (reservationId: string) => { // 🌟 CHANGED TO STRING
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.status === 'InHouse') {
    throw new Error('Cannot cancel a checked-in reservation');
  }
  if (reservation.status === 'Cancelled') {
    throw new Error('This reservation is already cancelled');
  }
  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available');
  }
  const amountPaid = Number(reservation.amountPaid || 0);
  const refundDue = amountPaid;
  const refundStatus = refundDue > 0 ? 'Pending' : 'None';
  return reservationRepository.cancelReservation(reservationId, {
    refundDue,
    refundStatus,
    cancellationDate: new Date(),
  });
};

export const checkInGuest = async (reservationId: string) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');

  if (reservation.status !== 'Confirmed') {
    throw new Error('Reservation must be confirmed to check in');
  }

  // 🌟 CHANGED: 'CheckedIn' → 'InHouse' at reservation level
  await reservationRepository.updateReservationStatus(reservationId, 'InHouse');

  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Occupied');
  }

  if (reservation.propertyGuestId) {
    await updateGuestLastStay(reservation.propertyGuestId);
  }

  return reservationRepository.findReservationById(reservationId);
};

export const checkOutGuest = async (reservationId: string) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');

  if (reservation.status !== 'InHouse') {
    throw new Error('Reservation must be checked in to check out');
  }

  // 🌟 CHANGED: 'CheckedOut' → 'Completed' at reservation level
  await reservationRepository.updateReservationStatus(reservationId, 'Completed');

  for (const rr of reservation.reservationRooms) {
    await updateRoomStatus(rr.roomId, 'Available', 'Dirty');
  }

  return reservationRepository.findReservationById(reservationId);
};

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

export const getReservationStats = async (reservationId: string) => { // 🌟 CHANGED TO STRING
  const stats = await reservationRepository.getReservationStats(reservationId);
  if (!stats) throw new Error('Reservation not found');
  return stats;
};

export const updateReservationFinancials = async (
  reservationId: string, // 🌟 CHANGED TO STRING
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

export const updateReservationRoomStatus = async (
  reservationRoomId: number,
  status: string,
  occupantName?: string,
  userPropertyId?: number
) => {
  const resRoom = await reservationRepository.findReservationRoomById(reservationRoomId);
  if (!resRoom) throw new Error('Reservation room not found');
  
  if (userPropertyId && resRoom.reservation.propertyId !== userPropertyId) {
    throw new Error('You do not have access to this reservation room');
  }

  const updateData: any = { status };
  if (occupantName !== undefined) updateData.occupantName = occupantName;

  if (status === 'CheckedIn') {
    // 🚨 SAFETY: Prevent double check-in of the same physical room
    const conflict = await reservationRepository.findConflictingCheckIn(
      resRoom.roomId, 
      reservationRoomId
    );
    
    if (conflict) {
      const otherGuest = conflict.reservation.platformGuest?.fullName 
        || conflict.reservation.propertyGuest?.fullName 
        || 'another guest';
      throw new Error(
        `Room ${conflict.room.roomNumber} is already occupied by ${otherGuest} (Reservation #${conflict.reservation.reservationId}). ` +
        `Please check out the current guest before checking in a new one.`
      );
    }

    updateData.actualCheckIn = new Date();
    await updateRoomStatus(resRoom.roomId, 'Occupied');
  } else if (status === 'CheckedOut') {
    updateData.actualCheckOut = new Date();
    await updateRoomStatus(resRoom.roomId, 'Available', 'Dirty');
  }

  // Update the room
  const updatedRoom = await reservationRepository.updateReservationRoomStatus(reservationRoomId, updateData);

  // 🌟 PHASE 2: AUTO-DERIVE the parent reservation status
  const newReservationStatus = await reservationRepository.deriveReservationStatus(resRoom.reservationId);
  await reservationRepository.updateReservationStatus(resRoom.reservationId, newReservationStatus);

  return updatedRoom;
};

export const extendReservationRoom = async (
  reservationRoomId: number,
  newCheckOutDate: string,
  userPropertyId?: number
) => {
  const resRoom = await reservationRepository.findReservationRoomById(reservationRoomId);
  if (!resRoom) throw new Error('Reservation room not found');
  
  if (userPropertyId && resRoom.reservation.propertyId !== userPropertyId) {
    throw new Error('You do not have access to this reservation room');
  }

  if (resRoom.status !== 'CheckedIn') {
    throw new Error('Can only extend stay for checked-in rooms');
  }

  const newCheckOut = new Date(newCheckOutDate);
  const currentCheckOut = new Date(resRoom.checkOutDate);
  
  if (newCheckOut <= currentCheckOut) {
    throw new Error('New check-out date must be after current check-out date');
  }

  // 🌟 Capture original date if this is the first extension
  const originalCheckOut = resRoom.originalCheckOutDate || currentCheckOut;

  // 🚨 CHECK: Is this room available for the extended dates?
  const conflictingBooking = await reservationRepository.findConflictingReservationRoom(
    resRoom.roomId,
    reservationRoomId,
    newCheckOut,
    currentCheckOut
  );

  if (conflictingBooking) {
    const conflictData = conflictingBooking as any;
    const otherGuest = conflictData.reservation?.platformGuest?.fullName 
      || conflictData.reservation?.propertyGuest?.fullName 
      || 'another guest';
    throw new Error(
      `Room ${conflictData.room?.roomNumber} is already booked by ${otherGuest} ` +
      `from ${new Date(conflictData.checkInDate).toLocaleDateString()} to ${new Date(conflictData.checkOutDate).toLocaleDateString()}. ` +
      `Cannot extend stay for this room.`
    );
  }

  // ✅ 1. Update the specific room's check-out date
  await reservationRepository.updateReservationRoomCheckOutDate(
    reservationRoomId,
    newCheckOut,
    originalCheckOut
  );

  // 🌟 2. CRITICAL: Recalculate the ENTIRE reservation's total amount (multi-room safe)
  const fullReservation = await reservationRepository.findReservationById(resRoom.reservationId);
  if (!fullReservation) throw new Error('Reservation not found after update');
  
  let grandTotal = 0;
  for (const room of fullReservation.reservationRooms) {
    const roomCheckOut = room.reservationRoomId === reservationRoomId ? newCheckOut : new Date(room.checkOutDate);
    const roomCheckIn = new Date(room.checkInDate);
    const roomNights = Math.ceil((roomCheckOut.getTime() - roomCheckIn.getTime()) / (1000 * 60 * 60 * 24));
    grandTotal += parseFloat(room.agreedPricePerNight.toString()) * roomNights;
  }

  // 3. Update financials with the correct grand total
  await reservationRepository.updateReservationFinancials(
    resRoom.reservationId,
    grandTotal,
    Number(fullReservation.amountPaid || 0)
  );

  // 4. Return the freshly updated room data
  return reservationRepository.findReservationRoomById(reservationRoomId);
};

export const updateOccupantName = async (
  reservationRoomId: number,
  occupantName: string,
  userPropertyId?: number
) => {
  const resRoom = await reservationRepository.findReservationRoomById(reservationRoomId);
  if (!resRoom) throw new Error('Reservation room not found');
  
  if (userPropertyId && resRoom.reservation.propertyId !== userPropertyId) {
    throw new Error('You do not have access to this reservation room');
  }

  return reservationRepository.updateReservationRoomStatus(reservationRoomId, { occupantName });
};

// 🌟 PHASE 2: Mark reservation as No-Show
export const markAsNoShow = async (reservationId: string, userPropertyId?: number) => {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  
  if (userPropertyId && reservation.propertyId !== userPropertyId) {
    throw new Error('You do not have access to this reservation');
  }

  if (reservation.status !== 'Confirmed') {
    throw new Error(`Cannot mark as no-show. Reservation is currently "${reservation.status}". Only "Confirmed" reservations can be marked as no-show.`);
  }

  // Check if any room is already checked in
  const hasCheckedInRoom = reservation.reservationRooms.some(r => r.status === 'CheckedIn');
  if (hasCheckedInRoom) {
    throw new Error('Cannot mark as no-show. At least one room is already checked in.');
  }

  return reservationRepository.markReservationAsNoShow(reservationId);
};