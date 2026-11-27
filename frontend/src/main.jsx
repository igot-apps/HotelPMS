import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';
import './lib/toastSetup';
import { enableDatePickers } from './lib/datePickers';
import { disableWheelOnNumberInputs } from './lib/numberInputs';
import { enableViewportFix } from './lib/viewportFix';
import ErrorBoundary from './components/ErrorBoundary';
import { registerServiceWorker } from './lib/push';
import { useAuthStore } from './store/authStore';
import { usePlatformAuthStore } from './store/platformAuthStore';

enableDatePickers();
disableWheelOnNumberInputs();
enableViewportFix(); // phones: tap targets stay lined up after the keyboard closes
registerServiceWorker(); // receives push notifications for staff who turn them on

// Data freshness: every screen still asks the server again whenever it opens (staleTime 0), and the
// server stays the authority on availability, payments and permissions. What changed for phones:
//  - the last answer is kept for 5 minutes, so going Back shows it at once (no blank flash) while the
//    fresh one loads, instead of an empty screen each time;
//  - switching away from the app for a few seconds no longer reloads every panel at once — only a
//    return after 20 s or more does;
//  - saves are never held back while offline to be sent later: they fail at once and say so.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      networkMode: 'always', // never queue a payment, booking or refund to send later
      retry: false,          // never repeat a save automatically
    },
  },
});

const RETURN_AFTER_MS = 20000;
focusManager.setEventListener((setFocused) => {
  let hiddenAt = 0;
  const changed = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= RETURN_AFTER_MS) { setFocused(false); setFocused(true); }
    hiddenAt = 0;
  };
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
});

// Kept answers belong to the person who loaded them: forget them when someone signs out or in, or
// switches property, so the next person never sees the previous person's figures.
const whoHotel = (state) => `${state.accessToken ? 1 : 0}:${state.user?.userId ?? ''}:${state.user?.propertyId ?? ''}`;
const whoPlatform = (state) => `${state.accessToken ? 1 : 0}:${state.user?.id ?? state.user?.userId ?? ''}`;
useAuthStore.subscribe((state, previous) => { if (whoHotel(state) !== whoHotel(previous)) queryClient.clear(); });
usePlatformAuthStore.subscribe((state, previous) => { if (whoPlatform(state) !== whoPlatform(previous)) queryClient.clear(); });
window.addEventListener('guest-session-changed', () => queryClient.clear());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);       