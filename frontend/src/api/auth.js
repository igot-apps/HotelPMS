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