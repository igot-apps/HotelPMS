import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  
  // 🛡️ Check BOTH the flag and the user object to prevent edge-case crashes
  const isLoggedIn = isAuthenticated && !!user;

  if (!isLoggedIn) {
    // 🚨 Redirect to login, but save the page they were trying to visit
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}