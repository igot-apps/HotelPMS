import api from '../lib/axios';

// Hotel billing. Prices and plan rules come from the backend only.
export const fetchSubscriptionStatus = () => api.get('/paystack/subscription-status');
export const fetchSubscriptionQuote = (params) => api.get('/paystack/quote', { params, skipErrorToast: true }); // errors shown inline
export const initializeSubscriptionPayment = (data) => api.post('/paystack/initialize', data, { skipErrorToast: true }); // page shows its own toast
export const verifyPayment = (reference) => api.get(`/paystack/verify/${encodeURIComponent(reference)}`);
