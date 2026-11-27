import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { lazyPage, preloadWhenIdle } from './lib/lazyPage';
import { useAuthStore } from './store/authStore';
import PageLoading from './components/ui/PageLoading';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import GuestProtectedRoute from './components/auth/GuestProtectedRoute';
import RedirectIfSignedIn from './components/auth/RedirectIfSignedIn';

// Property Registration and PMS Public Pages
import LoginPage from './pages/LoginPage';
const StaffSetupPage = lazyPage(() => import('./pages/StaffSetupPage'));
const StaffPasswordResetPage = lazyPage(() => import('./pages/StaffPasswordResetPage'));
const HotelRegistrationWizard = lazyPage(() => import('./pages/HotelRegistrationWizard'));
const DiscoverPage = lazyPage(() => import('./pages/DiscoverPage')); // 🌟 NEW: Main Public Homepage
const ForHotelsPage = lazyPage(() => import('./pages/ForHotelsPage'));

// 🌟 Public Website Pages (Guest Booking Flow)
const PublicHotelPage = lazyPage(() => import('./pages/PublicHotelPage'));
const GuestAuthPage = lazyPage(() => import('./pages/GuestAuthPage'));
const PublicCheckoutPage = lazyPage(() => import('./pages/PublicCheckoutPage'));
const PublicBookingSuccessPage = lazyPage(() => import('./pages/PublicBookingSuccessPage'));
const PublicAuthPage = lazyPage(() => import('./pages/PublicAuthPage'));
const PublicReservationsPage = lazyPage(() => import('./pages/PublicReservationsPage'));
import HotelWebsiteGate from './components/public/HotelWebsiteGate';
import { SHOW_DISCOVER } from './lib/platformConfig';


// Protected Pages (Staff PMS)
import DashboardPage from './pages/DashboardPage';
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'));
const ActivityLogPage = lazyPage(() => import('./pages/ActivityLogPage'));
const RefundsPage = lazyPage(() => import('./pages/RefundsPage'));
const RoomsPage = lazyPage(() => import('./pages/RoomsPage'));
const HousekeepingPage = lazyPage(() => import('./pages/HousekeepingPage'));
const GuestsPage = lazyPage(() => import('./pages/GuestsPage'));
const ReservationsPage = lazyPage(() => import('./pages/ReservationsPage'));
const PropertiesPage = lazyPage(() => import('./pages/PropertiesPage'));
const ReservationDetailsPage = lazyPage(() => import('./pages/ReservationDetailsPage'));
const CalendarPage = lazyPage(() => import('./pages/CalendarPage'));
const AvailabilityPage = lazyPage(() => import('./pages/AvailabilityPage'));
const RoomManagementPage = lazyPage(() => import('./pages/RoomManagementPage'));
const UsersPage = lazyPage(() => import('./pages/UsersPage'));
const BillingPage = lazyPage(() => import('./pages/BillingPage'));
const MyProfilePage = lazyPage(() => import('./pages/MyProfilePage'));
const GuestProfilePage = lazyPage(() => import('./pages/GuestProfilePage'));
const SuperAdminPage = lazyPage(() => import('./pages/SuperAdminPage'));
const PlatformAccountLinkPage = lazyPage(() => import('./pages/PlatformAccountLinkPage'));

function LegacyBookingRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: location.pathname.replace(/^\/reservations/, '/bookings'), search: location.search, hash: location.hash }} replace state={location.state} />;
}

function App() {
  // The pages staff open most from the bottom bar load in the background, so the first tap is instant.
  useEffect(() => { if (useAuthStore.getState().accessToken) preloadWhenIdle([ReservationsPage, ReservationDetailsPage, RoomsPage, GuestsPage]); }, []);
  return (
    <BrowserRouter>
      <HotelWebsiteGate>
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

      <Suspense fallback={<PageLoading fullScreen />}>
      <Routes>
        {/* ========================================== */}
        {/* 🌟 PUBLIC ROUTES (No login required)       */}
        {/* ========================================== */}
        <Route path="/" element={SHOW_DISCOVER ? <DiscoverPage /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
        <Route path="/staff" element={<Navigate to="/login" replace />} />
        <Route path="/staff/setup" element={<StaffSetupPage />} />
        <Route path="/staff/reset-password" element={<StaffPasswordResetPage />} />
        <Route path="/hotel/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
        <Route path="/for-hotels" element={<ForHotelsPage />} />
        <Route path="/superadmin" element={<SuperAdminPage />} />
        <Route path="/superadmin/setup" element={<PlatformAccountLinkPage mode="setup" />} />
        <Route path="/superadmin/reset-password" element={<PlatformAccountLinkPage mode="reset" />} />
        <Route path="/superadmin/verify-email" element={<PlatformAccountLinkPage mode="verify" />} />
        <Route path="/platform/properties" element={<Navigate to="/superadmin" replace />} />
        <Route path="/register-your-hotel" element={<HotelRegistrationWizard />} />
        <Route path="/public/reservations" element={<GuestProtectedRoute><PublicReservationsPage /></GuestProtectedRoute>} />
        <Route path="/public/profile" element={<GuestProtectedRoute><GuestProfilePage /></GuestProtectedRoute>} />
        
        {/* 🌟 Guest Booking Flow */}
        <Route path="/public/:propertyCode" element={<PublicHotelPage />} />
        <Route path="/public/:propertyCode/auth" element={<RedirectIfSignedIn as="guest"><GuestAuthPage /></RedirectIfSignedIn>} />
        <Route path="/public/:propertyCode/book/:roomTypeId" element={<PublicCheckoutPage />} />
        <Route path="/public/:propertyCode/booking-success" element={<PublicBookingSuccessPage />} />
        <Route path="/public/auth" element={<RedirectIfSignedIn as="guest"><PublicAuthPage /></RedirectIfSignedIn>} />

        {/* ========================================== */}
        {/* 🔒 PROTECTED ROUTES (Wrapped in Layout)    */}
        {/* ========================================== */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/approvals" element={<Navigate to="/dashboard" replace />} />
          <Route path="/refunds" element={<RefundsPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/housekeeping" element={<HousekeepingPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/bookings" element={<ReservationsPage />} />
          <Route path="/bookings/:id" element={<ReservationDetailsPage />} />
          <Route path="/reservations" element={<LegacyBookingRedirect />} />
          <Route path="/reservations/:id" element={<LegacyBookingRedirect />} />
          <Route path="/payments" element={<Navigate to="/bookings" replace />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/activity" element={<ActivityLogPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/room-management" element={<RoomManagementPage />} />
          <Route path="/rate-plans" element={<Navigate to="/room-management" replace />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/profile" element={<MyProfilePage />} />
        </Route>

        {/* ========================================== */}
        {/* Fallback Route                             */}
        {/* ========================================== */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </HotelWebsiteGate>
    </BrowserRouter>
  );
}

export default App;
