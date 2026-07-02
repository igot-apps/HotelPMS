import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RoomsPage from './pages/RoomsPage';
import GuestsPage from './pages/GuestsPage';
import ReservationsPage from './pages/ReservationsPage';
import PaymentsPage from './pages/PaymentsPage';
import ReportsPage from './pages/ReportsPage';
import RoomTypesPage from './pages/RoomTypesPage';
import RatePlansPage from './pages/RatePlansPage';
import PropertiesPage from './pages/PropertiesPage';
import ReservationDetailsPage from './pages/ReservationDetailsPage';
import CalendarPage from './pages/CalendarPage';

function App() {
  return (
    <BrowserRouter>
      {/* Global Toast Container */}
      <Toaster 
  position="top-right"
  toastOptions={{
    duration: 8000,
    
    // 🌟 BASE STYLE: The Frosted Glass Effect
    style: {
      background: 'rgba(255, 255, 255, 0.7)', // 70% opaque white (Change to rgba(15, 23, 42, 0.7) if your app is Dark Mode)
      backdropFilter: 'blur(12px)',           // The magic "frosted glass" blur
      WebkitBackdropFilter: 'blur(12px)',     // Required for Safari support
      border: '1px solid rgba(255, 255, 255, 0.4)', // Subtle glass edge
      borderRadius: '16px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
      color: '#1f2937', // Dark slate text
      fontWeight: '500',
      padding: '14px 20px',
      fontSize: '14px',
    },

    // 🟢 SUCCESS STYLE: Semi-transparent Emerald Green
    success: {
      style: {
        background: 'rgba(16, 185, 129, 0.15)', // 15% opaque green
        border: '1px solid rgba(16, 185, 129, 0.3)',
        color: '#065f46', // Dark green text for readability
      },
      iconTheme: {
        primary: '#10b981', // Solid green icon
        secondary: '#ffffff',
      },
    },

    // 🔴 ERROR STYLE: Semi-transparent Red
    error: {
      style: {
        background: 'rgba(239, 68, 68, 0.15)', // 15% opaque red
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#991b1b', // Dark red text for readability
      },
      iconTheme: {
        primary: '#ef4444', // Solid red icon
        secondary: '#ffffff',
      },
    },
  }}
/>

      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes (Wrapped in Layout) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Default Route */}
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          {/* Core Operations */}
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="guests" element={<GuestsPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          
          {/* FIX: Reservation Details is now correctly nested as a child route */}
          <Route path="reservations/:id" element={<ReservationDetailsPage />} />
          
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="calendar" element={<CalendarPage />} />        
          
          {/* Configuration Pages */}
          <Route path="room-types" element={<RoomTypesPage />} />
          <Route path="rate-plans" element={<RatePlansPage />} />
          <Route path="properties" element={<PropertiesPage />} />
        </Route>
        
        {/* Fallback Route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;