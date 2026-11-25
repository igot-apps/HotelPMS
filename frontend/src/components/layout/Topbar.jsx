import { useAuthStore } from '../../store/authStore';
import { Menu, HandCoins } from 'lucide-react';
import PropertySwitcher from './PropertySwitcher';
import { Link } from 'react-router-dom';
import useRefundCount from '../../hooks/useRefundCount';

export default function Topbar({ onMenuClick, isMenuOpen }) {
  const user = useAuthStore((state) => state.user);
  const refunds = useRefundCount();

  return (
    <header className="h-16 shrink-0 gap-2 bg-surface border-b border-border flex items-center justify-between px-3 sm:px-4 md:px-8 sticky top-0 z-40">
      {/* Left Side: Mobile Menu Button & Current Property */}
      <div className="min-w-0 flex items-center gap-1 sm:gap-4">
        {/* Hamburger Button (Only visible on mobile) */}
        <button 
          onClick={onMenuClick} 
          className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition md:hidden"
          aria-label="Toggle Menu"
          aria-expanded={isMenuOpen}
          aria-controls="hotel-sidebar"
        >
          <Menu size={24} />
        </button>

        {/* Active property, always visible. Owners with several properties can switch here. */}
        <PropertySwitcher />
      </div>

      {/* Right Side: User Profile */}
      <div className="shrink-0 flex items-center gap-2 sm:gap-4 ml-auto">
        {user?.role === 'Receptionist' && <Link to="/refunds" aria-label={refunds.isError ? 'Refunds, count unavailable' : `Refunds, ${refunds.data?.ready || 0} waiting to be returned`} className="relative flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-semibold text-primary-700 md:hidden"><HandCoins size={19} /><span>Refunds</span>{(refunds.data?.ready > 0 || refunds.isError) && <span className="absolute -right-1 -top-1 rounded-full bg-primary-100 px-1.5 text-xs font-bold text-primary-900">{refunds.isError ? '!' : refunds.data.ready > 99 ? '99+' : refunds.data.ready}</span>}</Link>}
        <div className="text-right hidden sm:block max-w-40 truncate">
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
