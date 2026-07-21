import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Property Registration and PMS Public Pages
import LoginPage from './pages/LoginPage';
import HotelRegistrationWizard from './pages/HotelRegistrationWizard';
import DiscoverPage from './pages/DiscoverPage'; // 🌟 NEW: Main Public Homepage

// 🌟 Public Website Pages (Guest Booking Flow)
import PublicHotelPage from './pages/PublicHotelPage';
import GuestAuthPage from './pages/GuestAuthPage';
import PublicCheckoutPage from './pages/PublicCheckoutPage';
import PublicBookingSuccessPage from './pages/PublicBookingSuccessPage';
import PublicAuthPage from './pages/PublicAuthPage';
import PublicReservationsPage from './pages/PublicReservationsPage';


// Protected Pages (Staff PMS)
import DashboardPage from './pages/DashboardPage';
import RoomsPage from './pages/RoomsPage';
import GuestsPage from './pages/GuestsPage';
import ReservationsPage from './pages/ReservationsPage';
import PaymentsPage from './pages/PaymentsPage';
import ReportsPage from './pages/ReportsPage';
import RatePlansPage from './pages/RatePlansPage';
import PropertiesPage from './pages/PropertiesPage';
import ReservationDetailsPage from './pages/ReservationDetailsPage';
import CalendarPage from './pages/CalendarPage';
import AvailabilityPage from './pages/AvailabilityPage';
import RoomManagementPage from './pages/RoomManagementPage';
import UsersPage from './pages/UsersPage';
import BillingPage from './pages/BillingPage';

function App() {
  return (
    <BrowserRouter>
      {/* Global Toast Container */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            color: '#1f2937',
            fontWeight: '500',
            padding: '14px 20px',
            fontSize: '14px',
          },
          success: {
            style: {
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#065f46',
            },
            iconTheme: { primary: '#10b981', secondary: '#ffffff' },
          },
          error: {
            style: {
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#991b1b',
            },
            iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          },
        }}
      />

      <Routes>
        {/* ========================================== */}
        {/* 🌟 PUBLIC ROUTES (No login required)       */}
        {/* ========================================== */}
        <Route path="/" element={<DiscoverPage />} /> {/* 🌟 NEW: Main Public Homepage */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register-your-hotel" element={<HotelRegistrationWizard />} />
        <Route path="/public/reservations" element={<PublicReservationsPage />} />
        
        {/* 🌟 Guest Booking Flow */}
        <Route path="/public/:propertyCode" element={<PublicHotelPage />} />
        <Route path="/public/:propertyCode/auth" element={<GuestAuthPage />} />
        <Route path="/public/:propertyCode/book/:roomTypeId" element={<PublicCheckoutPage />} />
        <Route path="/public/:propertyCode/booking-success" element={<PublicBookingSuccessPage />} />
        <Route path="/public/auth" element={<PublicAuthPage />} />

        {/* ========================================== */}
        {/* 🔒 PROTECTED ROUTES (Wrapped in Layout)    */}
        {/* ========================================== */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/:id" element={<ReservationDetailsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/room-management" element={<RoomManagementPage />} />
          <Route path="/rate-plans" element={<RatePlansPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/billing" element={<BillingPage />} />
        </Route>

        {/* ========================================== */}
        {/* Fallback Route                             */}
        {/* ========================================== */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;