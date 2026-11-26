// frontend/src/api/auth.js
import api from '../lib/axios';

// ==========================================
// 1. STAFF LOGIN (For the PMS Dashboard)
// ==========================================
export const loginUser = (data) => api.post('/auth/login', data);

// ==========================================
// 2. B2B SAAS REGISTRATION (For new hotels)
// ==========================================
export const registerHotel = (data) => api.post('/auth/register-hotel', data);

// ==========================================
// 3. TOKEN REFRESH
// ==========================================
export const refreshToken = (refreshToken) => api.post('/auth/refresh-token', { refreshToken });

// ==========================================
// 4. GET CURRENT USER (Protected)
// ==========================================
export const getMe = () => api.get('/auth/me');

export const requestStaffPasswordReset = (email) => api.post('/auth/forgot-password', { email });
export const resetStaffPassword = (token, password) => api.post('/auth/reset-password', { token, password });

// Owners with several properties: move this session to another property (fresh tokens).
export const switchProperty = (propertyId) => api.post('/auth/switch-property', { propertyId });
// Owners: add another property to the same account.
export const addProperty = (data) => api.post('/auth/properties', data);
// Signed-in staff: change own password (errors shown on the form). Returns fresh tokens for this device.
export const changeMyPassword = (currentPassword, newPassword) => api.post('/auth/change-password', { currentPassword, newPassword }, { skipErrorToast: true });
