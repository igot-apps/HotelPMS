import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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