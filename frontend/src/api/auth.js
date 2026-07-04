// src/api/auth.js
import api from '../lib/axios'; // Assuming your axios instance is exported here

/**
 * Login user and return tokens + permissions
 */
export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data; // Returns { success: true, data: { user, accessToken, refreshToken, permissions } }
};

/**
 * Logout user (Optional: if you have a backend endpoint to blacklist refresh tokens)
 */
export const logout = async () => {
  // await api.post('/auth/logout');
};

/**
 * Get current user profile (Useful for refreshing user data on page reload)
 */
export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};