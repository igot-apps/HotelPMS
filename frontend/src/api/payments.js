// Payment API module
import api from '../lib/axios';
import { getReservations } from './reservations'; // Reusing reservations API for the dropdown

// Fetch payments with pagination
export const getPayments = (params = {}) => {
  // 🌟 CRITICAL: Force propertyId 1 (OB-hotel) so we NEVER miss its payments
  return api.get('/payments', { 
    params: { ...params, propertyId: 1 } 
  });
};

// Fetch payment statistics (Total revenue, breakdown by method)
export const getPaymentStats = () => {
  return api.get('/payments/stats'); // ✅ Fixed to match backend route
};

// Record a new payment
export const recordPayment = (data) => {
  return api.post('/payments', data);
};

// Refund a payment (Soft delete)
export const refundPayment = (id) => {
  return api.delete(`/payments/${id}`);
};

// Helper to get active reservations for the payment dropdown
export const getActiveReservationsForPayment = (propertyId) => {
  return getReservations({ propertyId, limit: 50 });
};