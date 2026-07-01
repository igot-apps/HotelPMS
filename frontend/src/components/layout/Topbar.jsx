import { useAuthStore } from '../../store/authStore';
import { Menu, Building2 } from 'lucide-react'; // Added Building2 icon

export default function Topbar({ onMenuClick }) {
  const user = useAuthStore((state) => state.user);

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
      
      {/* Left Side: Mobile Menu Button & Current Property */}
      <div className="flex items-center gap-4">
        {/* Hamburger Button (Only visible on mobile) */}
        <button 
          onClick={onMenuClick} 
          className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition md:hidden"
          aria-label="Toggle Menu"
        >
          <Menu size={24} />
        </button>
        
        {/* NEW: Current Property Indicator Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary-50 border border-border rounded-lg">
          <Building2 size={16} className="text-primary-600" />
          <span className="text-sm font-semibold text-text truncate max-w-[150px] md:max-w-none" title={user?.tenantName}>
            {user?.tenantName || 'No Property'}
          </span>
        </div>
      </div>
      
      {/* Right Side: User Profile */}
      <div className="flex items-center gap-4 ml-auto">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-text">{user?.fullName || 'User'}</p>
          <p className="text-xs text-text-muted">{user?.role || 'Staff'}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-text-inverted font-bold text-sm">
          {user?.fullName?.charAt(0).toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
}