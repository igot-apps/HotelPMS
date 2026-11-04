import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Search, BedDouble, Users, CalendarDays, BarChart3,
  LogOut, Settings, Building2, X, Shield, Crown, ClipboardCheck, Undo2
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import RequirePermission from '../RequirePermission'; 
import useApprovalCount from '../../hooks/useApprovalCount';
import useRefundCount from '../../hooks/useRefundCount';

const operationItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/availability', icon: Search, label: 'Check Availability' },
  { to: '/reservations', icon: CalendarDays, label: 'Reservations', permission: 'CanCreateReservation' },
  { to: '/approvals', icon: ClipboardCheck, label: 'Approvals', managerOnly: true },
  { to: '/refunds', icon: Undo2, label: 'Refunds', staffOnly: true },
  { to: '/rooms', icon: BedDouble, label: 'Rooms & Inventory' },
  { to: '/guests', icon: Users, label: 'Guests' },
  { to: '/reports', icon: BarChart3, label: 'Reports', permission: 'CanViewFinancialReports' },
];

const configItems = [
  { to: '/room-management', icon: Settings, label: 'Room Management', permission: 'CanCreateRoom' },
  { to: '/users', icon: Shield, label: 'Staff Management', permission: 'CanManageStaffAndRoles' },
  { to: '/properties', icon: Building2, label: 'Properties' },
];

// 🌟 NEW: Account / SaaS Items
// 🌟 NEW: Account / SaaS Items
const accountItems = [
  // ✅ CHANGED: Now checks for the dedicated Billing permission
  { to: '/billing', icon: Crown, label: 'Billing & Plan', permission: 'CanManageBilling' }, 
];

export default function Sidebar({ isOpen, onClose }) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user); // 🌟 Get user for trial check
  const navigate = useNavigate();
  const approvals = useApprovalCount();
  const refunds = useRefundCount();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Helper to check if trial is expiring soon (for the pulsing dot)
  const getDaysLeft = () => {
    if (!user?.trialEndsAt || user?.subscriptionStatus === 'Active') return 99;
    const diff = new Date(user.trialEndsAt) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const daysLeft = getDaysLeft();

  const renderLinks = (items) => (
    items.map((item) => {
      if (item.managerOnly && user?.role !== 'Manager') return null;
      if (item.staffOnly && !['Manager','Receptionist'].includes(user?.role)) return null;
      const linkElement = (
        <li key={item.to}>
          <NavLink
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-primary-600/20 text-primary-400 border-l-4 border-primary-500' 
                  : 'text-secondary-300 hover:bg-secondary-800 hover:text-text-inverted'
              }`
            }
          >
            <item.icon size={20} />
            <span className="flex-1">{item.label}</span>
            {item.to === '/refunds' && (refunds.isError ? <span title="Could not refresh refunds" className="rounded bg-amber-100 px-2 text-xs text-amber-900">!</span> : refunds.data?.ready > 0 && <span aria-label={`${refunds.data.ready} approved refunds ready to return`} className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-900">{refunds.data.ready > 99 ? '99+' : refunds.data.ready}</span>)}
            {item.to === '/approvals' && (approvals.isError ? <span title="Could not refresh approvals" className="rounded bg-amber-100 px-2 text-xs text-amber-900">!</span> : (approvals.data?.actionRequired ?? approvals.data?.pending) > 0 && <span aria-label={`${(approvals.data.actionRequired ?? approvals.data.pending)} requests needing attention`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{(approvals.data.actionRequired ?? approvals.data.pending) > 99 ? '99+' : (approvals.data.actionRequired ?? approvals.data.pending)}</span>)}
            
            {/* 🌟 Premium UX: Pulsing red dot if trial is expiring in 3 days or less */}
            {item.to === '/billing' && user?.subscriptionStatus === 'Trial' && daysLeft <= 3 && (
              <span className="ml-auto w-2.5 h-2.5 bg-danger-500 rounded-full animate-pulse"></span>
            )}
          </NavLink>
        </li>
      );

      if (item.permission) {
        return (
          <RequirePermission key={item.to} permission={item.permission}>
            {linkElement}
          </RequirePermission>
        );
      }
      return linkElement;
    })
  );

  return (
    <aside id="hotel-sidebar" aria-label="Hotel navigation" className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-secondary-900 text-secondary-300 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible md:visible'} md:translate-x-0`}>
      <div className="p-6 border-b border-secondary-700 flex items-center justify-between">
        <NavLink
          to="/dashboard"
          onClick={onClose}
          aria-label="Hotel PMS dashboard"
          className="group rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <h1 className="text-xl font-bold text-text-inverted transition-colors group-hover:text-primary-300">🏨 Hotel PMS</h1>
          <p className="text-xs text-secondary-400 mt-1">Management System</p>
        </NavLink>
        <button aria-label="Close navigation" onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-800 text-secondary-400 transition md:hidden">
          <X size={20} />
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <p className="px-4 mb-2 text-xs font-bold text-secondary-500 uppercase tracking-wider">Operations</p>
        <ul className="space-y-1 mb-6">
          {renderLinks(operationItems)}
        </ul>
        
        <div className="border-t border-secondary-700 my-4"></div>
        
        <p className="px-4 mb-2 text-xs font-bold text-secondary-500 uppercase tracking-wider flex items-center gap-2">
          <Settings size={12} /> Configuration
        </p>
        <ul className="space-y-1 mb-6">
          {renderLinks(configItems)}
        </ul>

        {/* 🌟 NEW: Account Section */}
        <div className="border-t border-secondary-700 my-4"></div>
        <p className="px-4 mb-2 text-xs font-bold text-secondary-500 uppercase tracking-wider flex items-center gap-2">
          <Crown size={12} /> Account
        </p>
        <ul className="space-y-1">
          {renderLinks(accountItems)}
        </ul>

      </nav>

      <div className="p-4 border-t border-secondary-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-secondary-300 hover:bg-danger-500/10 hover:text-danger-400 transition-colors"
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </aside>
  );
}
