import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Search, BedDouble, Users, CalendarDays, BarChart3, Sparkles,
  LogOut, Settings, Building2, X, Shield, Crown, HandCoins, History, CalendarRange, UserRound
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import RequirePermission from '../RequirePermission'; 
import useRefundCount from '../../hooks/useRefundCount';
import useCheckoutAlerts from '../../hooks/useCheckoutAlerts';
import BrandMark from '../ui/BrandMark';

const operationItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/availability', icon: Search, label: 'Check Availability' },
  { to: '/bookings', icon: CalendarDays, label: 'Bookings', permission: 'CanCreateReservation' },
  { to: '/calendar', icon: CalendarRange, label: 'Calendar', permission: 'CanCreateReservation' },
  { to: '/refunds', icon: HandCoins, label: 'Refunds', staffOnly: true },
  { to: '/rooms', icon: BedDouble, label: 'Rooms & Inventory' },
  { to: '/housekeeping', icon: Sparkles, label: 'Housekeeping', housekeeping: true },
  { to: '/guests', icon: Users, label: 'Guests' },
  { to: '/reports', icon: BarChart3, label: 'Reports', permission: 'CanViewFinancialReports' },
  { to: '/activity', icon: History, label: 'Activity Log', managerOnly: true },
];

const configItems = [
  { to: '/room-management', icon: Settings, label: 'Room Management', permission: 'CanCreateRoom' },
  { to: '/users', icon: Shield, label: 'Staff Management', permission: 'CanManageStaffAndRoles' },
  { to: '/properties', icon: Building2, label: 'Properties', managerOnly: true },
];

// 🌟 NEW: Account / SaaS Items
// 🌟 NEW: Account / SaaS Items
const accountItems = [
  // ✅ CHANGED: Now checks for the dedicated Billing permission
  { to: '/billing', icon: Crown, label: 'Billing & Plan', permission: 'CanManageBilling' }, 
  { to: '/profile', icon: UserRound, label: 'My profile' },
];

export default function Sidebar({ isOpen, onClose }) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user); // 🌟 Get user for trial check
  const navigate = useNavigate();
  const refunds = useRefundCount();
  const checkoutAlerts = useCheckoutAlerts();
  const overdueCheckouts = checkoutAlerts.data?.counts?.overdue || 0;

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
      if (user?.role === 'Housekeeper' && !['/housekeeping', '/profile'].includes(item.to)) return null;
      if (item.housekeeping && user?.role !== 'Housekeeper' && (!user?.housekeepingEnabled || !user?.permissions?.includes('CanManageHousekeeping'))) return null;
      if (item.staffOnly && !['Manager','Receptionist'].includes(user?.role)) return null;
      const linkElement = (
        <li key={item.to}>
          <NavLink
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-white/15 text-white font-semibold border-l-4 border-white' 
                  : 'text-primary-100 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <item.icon size={20} />
            <span className="flex-1">{item.label}</span>
            {item.to === '/dashboard' && overdueCheckouts > 0 && <span aria-label={`${overdueCheckouts} overstays`} title="Overstays" className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-bold text-danger-800">{overdueCheckouts > 99 ? '99+' : overdueCheckouts}</span>}
            {item.to === '/refunds' && (refunds.isError ? <span title="Could not refresh refunds" className="rounded bg-amber-100 px-2 text-xs text-amber-900">!</span> : refunds.data?.ready > 0 && <span aria-label={`${refunds.data.ready} approved refunds ready to return`} className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-900">{refunds.data.ready > 99 ? '99+' : refunds.data.ready}</span>)}
            
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
    <aside id="hotel-sidebar" aria-label="Hotel navigation" className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-gradient-to-b from-primary-800 to-primary-900 text-primary-100 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0 visible' : '-translate-x-full invisible md:visible'} md:translate-x-0`}>
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <NavLink
          to="/dashboard"
          onClick={onClose}
          aria-label="Hotel PMS dashboard"
          className="group rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <h1 className="flex items-center gap-2 text-xl font-bold text-white transition-colors group-hover:text-primary-100"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white"><BrandMark className="h-8 w-8" /></span>Hotel PMS</h1>
          <p className="text-xs text-primary-200 mt-1">Management System</p>
        </NavLink>
        <button aria-label="Close navigation" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-primary-100 transition md:hidden">
          <X size={20} />
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <p className="px-4 mb-2 text-xs font-bold text-primary-300 uppercase tracking-wider">Operations</p>
        <ul className="space-y-1 mb-6">
          {renderLinks(operationItems)}
        </ul>
        
        <div className="border-t border-white/10 my-4"></div>
        
        <p className="px-4 mb-2 text-xs font-bold text-primary-300 uppercase tracking-wider flex items-center gap-2">
          <Settings size={12} /> Configuration
        </p>
        <ul className="space-y-1 mb-6">
          {renderLinks(configItems)}
        </ul>

        {/* 🌟 NEW: Account Section */}
        <div className="border-t border-white/10 my-4"></div>
        <p className="px-4 mb-2 text-xs font-bold text-primary-300 uppercase tracking-wider flex items-center gap-2">
          <Crown size={12} /> Account
        </p>
        <ul className="space-y-1">
          {renderLinks(accountItems)}
        </ul>

      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-primary-100 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </aside>
  );
}
