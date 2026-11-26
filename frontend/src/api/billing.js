import api from '../lib/axios';

// Hotel billing. Prices and plan rules come from the backend only.
export const fetchSubscriptionStatus = () => api.get('/payments/subscription-status');
export const fetchSubscriptionQuote = (params) => api.get('/payments/quote', { params, skipErrorToast: true }); // errors shown inline
export const initializeSubscriptionPayment = (data) => api.post('/payments/initialize', data, { skipErrorToast: true }); // panel shows its own errors
export const submitSubscriptionOtp = (reference, otp) => api.post('/payments/otp', { reference, otp }, { skipErrorToast: true });
export const verifyPayment = (reference) => api.get(`/payments/verify/${encodeURIComponent(reference)}`, { skipErrorToast: true });
