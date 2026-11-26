import api from '../lib/axios';

// Super Admin sign-in and recovery (public, own rate limits). Pages show their own errors.
const quiet = { skipErrorToast: true };
export const platformLogin = (email, password) => api.post('/auth/platform/login', { email, password }, quiet);
export const requestPlatformPasswordReset = (email) => api.post('/auth/platform/forgot-password', { email }, quiet);
export const resetPlatformPassword = (token, password) => api.post('/auth/platform/reset-password', { token, password }, quiet);
export const acceptPlatformInvite = (token, password) => api.post('/auth/platform/accept-invite', { token, password }, quiet);
export const verifyPlatformEmail = (token) => api.post('/auth/platform/verify-email', { token }, quiet);

// Signed-in Super Admin.
export const getPlatformAdmins = () => api.get('/platform/admins');
export const getPlatformPaymentStatus = () => api.get('/platform/admins/payment-status');
export const getPlatformAdminActivity = () => api.get('/platform/admins/activity');
export const getMyPlatformAccount = () => api.get('/platform/admins/me');
export const invitePlatformAdmin = (data) => api.post('/platform/admins', data);
export const resendPlatformInvite = (id) => api.post(`/platform/admins/${id}/resend-invite`);
export const deactivatePlatformAdmin = (id) => api.post(`/platform/admins/${id}/deactivate`);
export const removePlatformAdmin = (id) => api.delete(`/platform/admins/${id}`);
export const reactivatePlatformAdmin = (id) => api.post(`/platform/admins/${id}/reactivate`);
export const updateMyPlatformName = (fullName) => api.put('/platform/admins/me/name', { fullName });
export const changeMyPlatformPassword = (currentPassword, newPassword) => api.put('/platform/admins/me/password', { currentPassword, newPassword }, quiet);
export const requestMyPlatformEmailChange = (currentPassword, newEmail) => api.post('/platform/admins/me/email', { currentPassword, newEmail }, quiet);
