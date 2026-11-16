// Discover is shown unless VITE_SHOW_DISCOVER=false is set on the frontend build.
export const SHOW_DISCOVER = import.meta.env.VITE_SHOW_DISCOVER !== 'false';

// Staff always sign in on the central app, never on a hotel's own domain.
export const STAFF_APP_URL = (import.meta.env.VITE_STAFF_APP_URL || 'https://hotelpms-frontend.onrender.com').replace(/\/+$/, '');

export const STAFF_ENTRY_PATHS = ['/staff', '/login', '/hotel/login'];

export function staffLoginUrl(website) {
  const url = new URL('/login', STAFF_APP_URL);
  if (website?.propertyName) url.searchParams.set('hotel', website.propertyName);
  return url.toString();
}
