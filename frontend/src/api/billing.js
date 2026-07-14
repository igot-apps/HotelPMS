import api from '../lib/axios';

// Initialize a subscription payment via Paystack
export const initializeSubscriptionPayment = (data) => {
  return api.post('/paystack/initialize', data);
};

// 🌟 NEW: Verify payment after Paystack redirects back
export const verifyPayment = (reference) => {
  return api.get(`/paystack/verify/${reference}`);
};