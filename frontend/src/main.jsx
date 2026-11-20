import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';
import './lib/toastSetup';
import { enableDatePickers } from './lib/datePickers';
import { disableWheelOnNumberInputs } from './lib/numberInputs';
import ErrorBoundary from './components/ErrorBoundary';

enableDatePickers();
disableWheelOnNumberInputs();

// Create a React Query client with Caching DISABLED
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,           // Data is instantly considered "stale" (needs refetching)
      gcTime: 0,              // Garbage collect immediately (don't keep in memory)
      refetchOnWindowFocus: true, // Refetch data if you switch browser tabs and come back
      refetchOnMount: true,   // Always fetch fresh data when the page/component loads
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);       