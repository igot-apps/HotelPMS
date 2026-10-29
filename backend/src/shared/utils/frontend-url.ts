const PRODUCTION_FRONTEND_URL = 'https://hotelpms-frontend.onrender.com';

/**
 * Resolve the browser-facing app URL used by payment provider callbacks.
 * Production callbacks must never send hotel guests back to a developer's
 * localhost. Local development retains the familiar Vite default.
 */
export const getFrontendBaseUrl = (): string => {
  const configuredUrl = process.env.FRONTEND_URL?.trim().replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    if (!configuredUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredUrl)) {
      return PRODUCTION_FRONTEND_URL;
    }
  }

  return configuredUrl || 'http://localhost:5173';
};
