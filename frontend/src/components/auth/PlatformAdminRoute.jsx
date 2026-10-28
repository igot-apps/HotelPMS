import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function PlatformAdminRoute({ children }) {
  const isPlatformAdmin = useAuthStore((state) => state.user?.isPlatformAdmin);
  return isPlatformAdmin ? children : <Navigate to="/dashboard" replace />;
}
