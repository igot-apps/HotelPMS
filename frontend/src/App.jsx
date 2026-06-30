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
import RoomTypesPage from './pages/RoomTypesPage'; // Add this line

// ==========================================
// NEW: Temporary Placeholder Components
// (We will build the real pages in Phase 8)
// ==========================================
// const RoomTypesPage = () => (
//   <div className="bg-surface p-8 rounded-xl border border-border shadow-sm">
//     <h1 className="text-2xl font-bold text-text">Room Types</h1>
//     <p className="text-text-muted mt-2">This page is coming in Phase 8. Here you will manage categories like "Standard", "Deluxe", and "Suite".</p>
//   </div>
// );

const RatePlansPage = () => (
  <div className="bg-surface p-8 rounded-xl border border-border shadow-sm">
    <h1 className="text-2xl font-bold text-text">Rate Plans</h1>
    <p className="text-text-muted mt-2">This page is coming in Phase 8. Here you will manage pricing rules like "Weekend Special" or "Corporate Discount".</p>
  </div>
);

const PropertiesPage = () => (
  <div className="bg-surface p-8 rounded-xl border border-border shadow-sm">
    <h1 className="text-2xl font-bold text-text">Properties</h1>
    <p className="text-text-muted mt-2">This page is coming in Phase 8. Here you will manage different hotel locations.</p>
  </div>
);
// ==========================================

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
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="guests" element={<GuestsPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          
          {/* NEW: Routes for the Configuration Pages */}
          <Route path="room-types" element={<RoomTypesPage />} />
          <Route path="rate-plans" element={<RatePlansPage />} />
          <Route path="properties" element={<PropertiesPage />} />
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;