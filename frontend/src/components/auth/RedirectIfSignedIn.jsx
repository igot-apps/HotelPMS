import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/** Where a signed-in hotel staff member belongs. */
export const staffHome = (role) => (role === 'Housekeeper' ? '/housekeeping' : '/dashboard');

/**
 * Sign-in pages are for signed-out people. Anyone already signed in who opens one
 * (bookmark, back button, typed URL) goes straight to their own home page instead.
 *  - "staff": hotel staff sign-in → Dashboard (Housekeeping for housekeepers)
 *  - "guest": guest sign-in → where they were heading, else the hotel page / My reservations
 */
export default function RedirectIfSignedIn({ as = 'staff', children }) {
  const location = useLocation();
  const { propertyCode } = useParams();
  const staffUser = useAuthStore((state) => (state.isAuthenticated && state.accessToken ? state.user : null));

  if (as === 'staff' && staffUser) return <Navigate to={staffHome(staffUser.role)} replace />;

  if (as === 'guest') {
    const guestSignedIn = Boolean(localStorage.getItem('guestToken') && localStorage.getItem('guestInfo'));
    if (guestSignedIn) {
      const from = location.state?.from;
      const fallback = propertyCode ? `/public/${propertyCode}` : '/public/reservations';
      return <Navigate to={from || fallback} replace />;
    }
  }

  return children;
}
