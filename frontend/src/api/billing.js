import api from '../lib/axios';

export const initializeSubscriptionPayment = (data) => {
  return api.post('/paystack/initialize', data);
};

export const verifyPayment = (reference) => {
  return api.get(`/paystack/verify/${reference}`);
};

// 🌟 THIS MUST BE HERE FOR THE PAGE TO LOAD FRESH DATA
export const fetchSubscriptionStatus = () => {
  return api.get('/paystack/subscription-status');
};