import * as paymentRepository from './payment.repository';
import { findReservationById } from '../reservation/reservation.repository';
import { updateReservationFinancials } from '../reservation/reservation.repository';

export const recordPayment = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.reservationId) throw new Error('Reservation ID is required');
  if (!data.amount) throw new Error('Amount is required');
  if (data.amount <= 0) throw new Error('Amount must be greater than 0');
  if (!data.paymentMethod) throw new Error('Payment method is required');

  const reservation = await findReservationById(data.reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.status === 'Cancelled') {
    throw new Error('Cannot record payment for cancelled reservation');
  }

  const amount = Number(data.amount);
  const accummulatedPayments = await paymentRepository.calculateAccumulatedPayment(data.reservationId);
  
  if (amount + accummulatedPayments > Number(reservation.totalAmount)) {
    throw new Error('Payment amount exceeds total reservation amount');
  }

  const payment = await paymentRepository.createPayment({
    reservationId: data.reservationId,
    amount: data.amount,
    paymentMethod: data.paymentMethod,
    paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
    gatewayReference: data.gatewayReference,
    receivedBy: data.receivedBy,
    status: data.status || 'Completed',
    notes: data.notes,
  });

  const newAmountPaid = Number(reservation.amountPaid || 0) + amount;
  await updateReservationFinancials(
    data.reservationId,
    Number(reservation.totalAmount || 0),
    newAmountPaid
  );

  return payment;
};

export const getPayments = async (
  propertyId: number, // ✅ Replaced tenantId
  filters: {
    reservationId?: number;
    paymentMethod?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  },
  page: number = 1,
  limit: number = 10
) => {
  const fromDate = filters.fromDate ? new Date(filters.fromDate) : undefined;
  const toDate = filters.toDate ? new Date(filters.toDate) : undefined;

  return paymentRepository.findPayments(
    propertyId,
    {
      search: filters.search, 
      reservationId: filters.reservationId,
      paymentMethod: filters.paymentMethod,
      status: filters.status,
      fromDate,
      toDate,
    },
    page,
    limit
  );
};

export const getPaymentById = async (paymentId: number) => {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (!payment) throw new Error('Payment not found');
  return payment;
};

export const getPaymentsByReservation = async (reservationId: number) => {
  return paymentRepository.findPaymentsByReservation(reservationId);
};

export const updatePayment = async (paymentId: number, data: any) => {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (!payment) throw new Error('Payment not found');

  if (data.amount && data.amount !== Number(payment.amount)) {
    const reservation = await findReservationById(payment.reservationId);
    if (!reservation) throw new Error('Reservation not found');

    const oldAmount = Number(payment.amount);
    const newAmount = Number(data.amount);
    const diff = newAmount - oldAmount;
    const newAmountPaid = Number(reservation.amountPaid || 0) + diff;

    if (newAmountPaid < 0) {
      throw new Error('Cannot reduce payment below zero');
    }

    await updateReservationFinancials(
      payment.reservationId,
      Number(reservation.totalAmount || 0),
      newAmountPaid
    );
  }

  return paymentRepository.updatePayment(paymentId, data);
};

export const deletePayment = async (paymentId: number) => {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (!payment) throw new Error('Payment not found');

  const reservation = await findReservationById(payment.reservationId);
  if (!reservation) throw new Error('Reservation not found');

  const newAmountPaid = Number(reservation.amountPaid || 0) - Number(payment.amount);
  if (newAmountPaid < 0) {
    throw new Error('Cannot refund more than paid amount');
  }

  await updateReservationFinancials(
    payment.reservationId,
    Number(reservation.totalAmount || 0),
    newAmountPaid
  );

  return paymentRepository.deletePayment(paymentId);
};

export const getPaymentStatistics = async (propertyId: number) => { // ✅ Replaced tenantId
  return paymentRepository.getPaymentStats(propertyId);
};