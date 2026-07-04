import { useAuthStore } from '../store/authStore';

export default function RequirePermission({ permission, children, fallback = null }) {
  const hasPermission = useAuthStore((state) => state.permissions?.includes(permission) || false);
  
  if (!hasPermission) {
    return fallback; // Returns null (hidden) if they don't have permission
  }
  
  return children;
}