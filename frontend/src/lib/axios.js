import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore'; // Adjust path if your store is elsewhere

const api = axios.create({
  baseURL: 'http://localhost:3000/api', // Ensure this matches your backend URL
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==========================================
// 1. REQUEST INTERCEPTOR (Attach Token)
// ==========================================
api.interceptors.request.use(
  (config) => {
    // Get token from Zustand store (or localStorage)
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// 2. RESPONSE INTERCEPTOR (Global Error Handler)
// ==========================================
api.interceptors.response.use(
  (response) => response, // If it's a 2xx status, just return it
  (error) => {
    if (error.response) {
      // The request was made and the server responded with a status code out of 2xx
      const { status, data } = error.response;
      const backendMessage = data?.message || 'An unexpected error occurred.';

      // 🛑 CONSOLE LOG THE RAW ERROR FOR DEVELOPER DEBUGGING
      console.error(`[API Error ${status}]:`, data);

      // 🍞 HUMAN-FRIENDLY TOAST MAPPING
      let toastMessage = backendMessage;

      if (status === 401) {
        toastMessage = 'Your session has expired. Please log in again.';
        // Optional: trigger logout here
        // useAuthStore.getState().logout();
        // window.location.href = '/login';
        
      } else if (status === 403) {
        // 🌟 FIX: Read the specific message from the backend!
        // If the backend sent a specific message (like "Subscription expired" or "Access denied..."), show it.
        // Otherwise, fallback to the generic permission error.
        if (data?.code === 'SUBSCRIPTION_EXPIRED' || (data?.message && data.message !== 'Insufficient permissions')) {
          toastMessage = data.message;
        } else {
          toastMessage = 'You do not have permission to perform this action.';
        }
        
      } else if (status === 404) {
        toastMessage = 'The requested resource was not found.';
        
      } else if (status === 400) {
        // Backend validation errors (e.g., "Room 1 is not available") are usually already human-friendly
        toastMessage = backendMessage; 
        
      } else if (status >= 500) {
        toastMessage = 'A server error occurred. Please try again later.';
      }

      // Show the error toast
      toast.error(toastMessage);
      
    } else if (error.request) {
      // The request was made but no response was received (Network Error / Offline)
      console.error('[Network Error]:', error.request);
      toast.error('Network error. Please check your internet connection.');
      
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('[Setup Error]:', error.message);
      toast.error('An unexpected error occurred.');
    }

    // IMPORTANT: Return Promise.reject so the component's catch() block still works
    return Promise.reject(error); 
  }
);

export default api;