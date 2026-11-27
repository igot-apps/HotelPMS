import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore'; // Adjust path if your store is elsewhere
import { usePlatformAuthStore, isPlatformApiPath } from '../store/platformAuthStore';
import { recordServerTime, setResync } from './serverClock';
import { markReachable, markUnreachable, trackSave } from './connectionStatus';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  // Never leave a spinner running forever: give up after 60 s and say so.
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==========================================
// 0. SAVES: ONE AT A TIME, SAFE TO RETRY
// ==========================================
// A save (POST/PUT/PATCH/DELETE) carries an Idempotency-Key. The same save tapped twice while the first
// is still on its way shares the first one's reply instead of being sent again. If a save gets no reply
// at all (weak signal, timeout), its key is kept for a while: when staff send the same save again, the
// server recognises it and returns the original result instead of charging or booking twice.
// Nothing is ever retried automatically.
const UNCERTAIN_KEY_MS = 30 * 60 * 1000;
const inFlightSaves = new Map(); // fingerprint -> promise of the reply
const uncertainKeys = new Map(); // fingerprint -> { key, until }
const isSave = (method) => !['get', 'head', 'options'].includes(String(method || 'get').toLowerCase());
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
// Only JSON bodies (or none) can be compared; uploads are never merged with one another.
const fingerprintOf = (config) => (config.data == null || typeof config.data === 'string')
  ? `${String(config.method).toUpperCase()} ${new URL(config.url || '', config.baseURL || window.location.origin).href} ${config.data ?? ''}`
  : null;

const sendRequest = axios.getAdapter(api.defaults.adapter);
api.defaults.adapter = (config) => {
  if (!isSave(config.method)) return sendRequest(config);
  const fingerprint = fingerprintOf(config);
  if (fingerprint && inFlightSaves.has(fingerprint)) return inFlightSaves.get(fingerprint);
  if (fingerprint && !config.headers.get?.('Idempotency-Key')) {
    const kept = uncertainKeys.get(fingerprint);
    config.headers.set('Idempotency-Key', kept && kept.until > Date.now() ? kept.key : newKey());
  }
  const finished = trackSave();
  const reply = sendRequest(config).then(
    (response) => { if (fingerprint) uncertainKeys.delete(fingerprint); return response; },
    (error) => {
      if (fingerprint) {
        if (error.response) uncertainKeys.delete(fingerprint);
        else uncertainKeys.set(fingerprint, { key: config.headers.get?.('Idempotency-Key'), until: Date.now() + UNCERTAIN_KEY_MS });
      }
      throw error;
    },
  ).finally(() => { finished(); if (fingerprint) inFlightSaves.delete(fingerprint); });
  if (fingerprint) inFlightSaves.set(fingerprint, reply);
  return reply;
};

// ==========================================
// 1. REQUEST INTERCEPTOR (Attach Token)
// ==========================================
api.interceptors.request.use(
  (config) => {
    config.sentAt = performance.now(); // to allow for network delay when reading the server's time
    // Public guest endpoints use their own token; never attach the hotel staff token there.
    const requestPath = new URL(config.url || '', config.baseURL || window.location.origin).pathname;
    const isPublicRequest = requestPath.startsWith('/public/');
    const isGuestAuthRequest = requestPath.startsWith('/public/auth/');
    // Super Admin endpoints use the separate platform session, never the hotel staff token.
    const token = isPublicRequest
      ? (isGuestAuthRequest ? null : localStorage.getItem('guestToken'))
      : isPlatformApiPath(requestPath) ? usePlatformAuthStore.getState().accessToken
      : useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (isPublicRequest) {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// 2. RESPONSE INTERCEPTOR (Global Error Handler)
// ==========================================
api.interceptors.response.use(
  (response) => { markReachable(); recordServerTime(response.headers?.date, response.config?.sentAt); return response; }, // 2xx: note the server's time, return it
  (error) => {
    if (error.response) {
      markReachable();
      recordServerTime(error.response.headers?.date, error.config?.sentAt);
      // The request was made and the server responded with a status code out of 2xx
      const { status, data } = error.response;
      // This is an expected confirmation step, shown inline by the occupant form.
      if (status === 409 && data?.code === 'OCCUPANT_ALREADY_CHECKED_IN') return Promise.reject(error);
      const backendMessage = data?.message || 'An unexpected error occurred.';

      // 🛑 CONSOLE LOG THE RAW ERROR FOR DEVELOPER DEBUGGING
      console.error(`[API Error ${status}]:`, data);

      // 🍞 HUMAN-FRIENDLY TOAST MAPPING
      let toastMessage = backendMessage;

      if (status === 401) {
        const requestPath = new URL(error.config?.url || '', error.config?.baseURL || window.location.origin).pathname;
        const isPublicRequest = requestPath.startsWith('/public/');
        const guestToken = localStorage.getItem('guestToken');

        if (isPublicRequest && guestToken) {
          // The page handling the guest request will redirect to guest sign-in and show one message.
          localStorage.removeItem('guestInfo');
          localStorage.removeItem('guestToken');
          window.dispatchEvent(new Event('guest-session-changed'));
          error.guestSessionExpired = true;
        } else if (isPlatformApiPath(requestPath)) {
          // Only the Super Admin session is affected; a hotel session in this browser stays signed in.
          const currentToken = usePlatformAuthStore.getState().accessToken;
          if (currentToken && error.config?.headers?.Authorization === `Bearer ${currentToken}`) usePlatformAuthStore.getState().logout();
          toastMessage = requestPath.startsWith('/auth/platform/') ? backendMessage : 'Your administrator session has ended. Please sign in again.';
        } else if (!isPublicRequest) {
          // A response from an older session must not sign out a newer login.
          const currentToken = useAuthStore.getState().accessToken;
          const requestToken = error.config?.headers?.Authorization;
          if (currentToken && requestToken === `Bearer ${currentToken}`) {
            useAuthStore.getState().logout();
          }
          toastMessage = ['STAFF_ACCOUNT_DISABLED', 'STAFF_ACCESS_CHANGED'].includes(data?.code)
            ? backendMessage : 'Your session has expired. Please log in again.';
        }
        
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
        // Keep the server's reason ("Reservation not found for this hotel.") when it gives one.
        toastMessage = data?.message && data.message !== 'Route not found' ? data.message : 'That item could not be found. It may have been removed — refresh the page.';

      } else if (status === 429) {
        toastMessage = backendMessage || 'Too many attempts. Please wait a moment and try again.';
        
      } else if (status === 400) {
        // Backend validation errors (e.g., "Room 1 is not available") are usually already human-friendly
        toastMessage = backendMessage; 
        
      } else if (status >= 500) {
        // The server already sends a safe, friendly message for its own errors.
        toastMessage = data?.message || 'A server error occurred. Please try again later.';
      }

      // Public pages present their own auth errors and expired-session state.
      if (!(status === 401 && error.config && new URL(error.config.url || '', error.config.baseURL || window.location.origin).pathname.startsWith('/public/'))) {
        if (!error.config?.skipErrorToast) toast.error(toastMessage);
      }
      
    } else if (error.request) {
      // The request was made but no response was received (Network Error / Offline)
      console.error('[Network Error]:', error.request);
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      if (axios.isCancel(error)) return Promise.reject(error);
      markUnreachable();
      if (isSave(error.config?.method)) {
        // The save may or may not have reached the server. Say so plainly; sending the same save again is
        // safe (it carries the same key), but staff should look first.
        error.uncertain = true;
        if (!error.config?.skipErrorToast) toast.error(timedOut
          ? 'No reply from the server. This may or may not have been saved — check before trying again.'
          : 'Connection lost. This may or may not have been saved — check before trying again.', { duration: 8000 });
      }
      // Loading data: the connection strip at the top explains it and the page updates when it is back.
      else if (!document.documentElement.classList.contains('app-shell') && !error.config?.skipErrorToast) {
        // Public and sign-in pages have no connection strip: keep the message they always showed.
        toast.error(timedOut ? 'The server is taking too long to respond. Please try again.' : 'Network error. Please check your internet connection.');
      }
      
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('[Setup Error]:', error.message);
      if (!error.config?.skipErrorToast) toast.error('An unexpected error occurred.');
    }

    // IMPORTANT: Return Promise.reject so the component's catch() block still works
    return Promise.reject(error); 
  }
);

// When server time is no longer trusted (the computer slept or its clock changed), ask the tiny health
// endpoint once; its response carries the server's Date like any other.
setResync(() => api.get(new URL('/health', api.defaults.baseURL).href, { skipErrorToast: true }).catch(() => {}));

export default api;
