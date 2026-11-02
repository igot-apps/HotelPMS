import * as paymentRepository from './payment.repository';
import { findReservationById, updateReservationFinancials, updateReservation } from '../reservation/reservation.repository';
import { prisma } from '../../shared/utils/prisma';

export const recordPayment = async (data: any) => {
  const amount = Number(data.amount);
  if (typeof data.reservationId !== 'string' || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount) throw new Error('A reservation and positive payment amount with at most two decimal places are required.');
  if (typeof data.paymentMethod !== 'string' || !data.paymentMethod.trim()) throw new Error('Payment method is required.');
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<any[]>`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${data.reservationId} FOR UPDATE`;
    if (!locked.length) throw new Error('Reservation not found.');
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { reservationId: data.reservationId } });
    if (reservation.status === 'Cancelled') throw new Error('Cannot record payment for a cancelled reservation.');
    const ledger = await tx.payment.aggregate({ where: { reservationId: data.reservationId, status: 'Completed' }, _sum: { amount: true } });
    const paid = Number(ledger._sum.amount || 0);
    if (Math.abs(paid - Number(reservation.amountPaid)) > 0.01) throw new Error('Payment history and balance differ. Reconcile before adding a payment.');
    if (paid + amount > Number(reservation.totalAmount) + 0.001) throw new Error('Payment amount exceeds the outstanding balance.');
    const payment = await tx.payment.create({ data: { reservationId: data.reservationId, propertyId: reservation.propertyId, amount, paymentMethod: data.paymentMethod.trim(), receivedBy: data.receivedBy, status: 'Completed', gatewayReference: data.gatewayReference || null, notes: data.notes || null } });
    await tx.reservation.update({ where: { reservationId: data.reservationId }, data: { amountPaid: Math.round((paid + amount) * 100) / 100 } });
    return payment;
  });
};

export const getPayments = async (
  propertyId: number,
  filters: {
    reservationId?: string; // 🌟 CHANGED TO STRING
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
      reservationId: filters.reservationId, // 🌟 Now passes string correctly
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

export const getPaymentsByReservation = async (reservationId: string) => { // 🌟 CHANGED TO STRING
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

// ✅ UPGRADED: Now respects the "Flag & Review" workflow
export const processRefund = async (paymentId: number) => {
  const payment = await paymentRepository.findPaymentById(paymentId);
  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'Refunded') throw new Error('This payment has already been refunded');

  const reservation = await findReservationById(payment.reservationId);
  if (!reservation) throw new Error('Reservation not found');

  // 🚨 SECURITY CHECK: Ensure the reservation was actually flagged for a refund
  if (reservation.refundStatus !== 'Pending') {
    throw new Error('This reservation is not flagged for a refund. It must be cancelled first.');
  }

  // 1. Update the Payment status to 'Refunded'
  const updatedPayment = await paymentRepository.updatePayment(paymentId, { status: 'Refunded' });

  // 2. Deduct the amount from the Reservation's financials
  const currentAmountPaid = Number(reservation.amountPaid || 0);
  const refundAmount = Number(payment.amount);
  const newAmountPaid = currentAmountPaid - refundAmount;

  await updateReservationFinancials(
    payment.reservationId,
    Number(reservation.totalAmount || 0),
    newAmountPaid < 0 ? 0 : newAmountPaid // Prevent negative paid amounts
  );

  // 3. Update the Reservation's refund status to 'Processed'
  await updateReservation(reservation.reservationId, {
    refundStatus: 'Processed',
  });

  return updatedPayment;
};

export const getPaymentStatistics = async (propertyId: number) => {
  return paymentRepository.getPaymentStats(propertyId);
};