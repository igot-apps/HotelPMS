import api from '../lib/axios';

// Initialize a subscription payment via Paystack
export const initializeSubscriptionPayment = (data) => {
  return api.post('/paystack/initialize', data);
};