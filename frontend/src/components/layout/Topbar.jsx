import { useAuthStore } from '../../store/authStore';
import { Menu, Building2, ClipboardCheck, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import useApprovalCount from '../../hooks/useApprovalCount';
import useRefundCount from '../../hooks/useRefundCount';

export default function Topbar({ onMenuClick, isMenuOpen }) {
  const user = useAuthStore((state) => state.user);
  const approvals = useApprovalCount();
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

        {/* ✅ UPDATED: Current Property Indicator Badge (Tenant concept completely removed) */}
        <div className="min-w-0 flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-secondary-50 border border-border rounded-lg">
          <Building2 size={16} className="text-primary-600" />
          <span 
            className="text-sm font-semibold text-text truncate max-w-[150px] md:max-w-none" 
            title={user?.propertyName || 'No Property'}
          >
            {/* ✅ CHANGED: Removed tenantName fallback. Property is the root entity now. */}
            {user?.propertyName || 'No Property'}
          </span>
        </div>
      </div>

      {/* Right Side: User Profile */}
      <div className="shrink-0 flex items-center gap-2 sm:gap-4 ml-auto">
        {user?.role === 'Receptionist' && <Link to="/refunds" aria-label={refunds.isError ? 'Refunds, count unavailable' : `Refunds, ${refunds.data?.ready || 0} approved and ready to return`} className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-primary-700 md:hidden"><Undo2 size={21} />{(refunds.data?.ready > 0 || refunds.isError) && <span className="absolute -right-1 -top-1 rounded-full bg-primary-100 px-1.5 text-xs font-bold text-primary-900">{refunds.isError ? '!' : refunds.data.ready > 99 ? '99+' : refunds.data.ready}</span>}</Link>}
        {user?.role === 'Manager' && <Link to="/approvals" aria-label={approvals.isError ? 'Approvals, count unavailable' : `Approvals${approvals.data ? `, ${(approvals.data.actionRequired ?? approvals.data.pending)} need attention` : ''}`} className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-primary-700 md:hidden"><ClipboardCheck size={21} />{((approvals.data?.actionRequired ?? approvals.data?.pending) > 0 || approvals.isError) && <span className="absolute -right-1 -top-1 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-900">{approvals.isError ? '!' : (approvals.data.actionRequired ?? approvals.data.pending) > 99 ? '99+' : (approvals.data.actionRequired ?? approvals.data.pending)}</span>}</Link>}
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
