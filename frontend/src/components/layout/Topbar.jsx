import { useAuthStore } from '../../store/authStore';

export default function Topbar() {
  const user = useAuthStore((state) => state.user);

  return (
    // REFACTORED: Using 'surface', 'border', and 'text' tokens
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
      <h2 className="text-lg font-semibold text-text-muted hidden md:block">Welcome back!</h2>
      
      <div className="flex items-center gap-4 ml-auto">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-text">{user?.fullName || 'User'}</p>
          <p className="text-xs text-text-muted">{user?.role || 'Staff'}</p>
        </div>
        {/* REFACTORED: Avatar uses 'primary' background and 'text-inverted' */}
        <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-text-inverted font-bold text-sm">
          {user?.fullName?.charAt(0).toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
}