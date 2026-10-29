import { Navigate, useLocation } from 'react-router-dom';

export default function GuestProtectedRoute({ children }) {
  const location = useLocation();
  const hasGuestSession = Boolean(localStorage.getItem('guestToken') && localStorage.getItem('guestInfo'));

  if (!hasGuestSession) {
    return <Navigate to="/public/auth" state={{ from: location }} replace />;
  }

  return children;
}
