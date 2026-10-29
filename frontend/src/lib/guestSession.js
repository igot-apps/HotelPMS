import { useAuthStore } from '../store/authStore';

const GUEST_INFO_KEY = 'guestInfo';
const GUEST_TOKEN_KEY = 'guestToken';

export function clearGuestSession() {
  localStorage.removeItem(GUEST_INFO_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
}

export function startGuestSession(guest, token) {
  // Clear the in-memory and persisted staff session before creating a guest session.
  useAuthStore.getState().logout();
  localStorage.setItem(GUEST_INFO_KEY, JSON.stringify(guest));
  localStorage.setItem(GUEST_TOKEN_KEY, token);
  window.dispatchEvent(new Event('guest-session-changed'));
}
