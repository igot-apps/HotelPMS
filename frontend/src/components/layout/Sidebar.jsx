import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, Search, BedDouble, Users, CalendarDays, CreditCard, BarChart3, 
  LogOut, Settings, Layers, Tags, Building2, X 
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import RequirePermission from '../RequirePermission'; // Ensure this path is correct

const operationItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/availability', icon: Search, label: 'Check Availability' },
  { to: '/reservations', icon: CalendarDays, label: 'Reservations', permission: 'CanCreateReservation' },
  { to: '/rooms', icon: BedDouble, label: 'Rooms & Inventory' }, 
  { to: '/guests', icon: Users, label: 'Guests' },
  { to: '/payments', icon: CreditCard, label: 'Payments', permission: 'CanProcessPayments' },
  { to: '/reports', icon: BarChart3, label: 'Reports', permission: 'CanViewFinancialReports' },
];

const configItems = [
  // 🚨 NEW: Room Management link (Visible only to Managers who have 'CanCreateRoom')
  { to: '/room-management', icon: Settings, label: 'Room Management', permission: 'CanCreateRoom' },
  
  { to: '/room-types', icon: Layers, label: 'Room Types', permission: 'CanCreateRoomType' },
  { to: '/rate-plans', icon: Tags, label: 'Rate Plans', permission: 'CanManageRates' },
  { to: '/properties', icon: Building2, label: 'Properties' },
];

export default function Sidebar({ isOpen, onClose }) {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderLinks = (items) => (
    items.map((item) => {
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
            {item.label}
          </NavLink>
        </li>
      );

      // If the item has a permission property, wrap it in RequirePermission
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
    <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-secondary-900 text-secondary-300 flex flex-col transition-transform duration-300 ease-in-out 
      ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      
      <div className="p-6 border-b border-secondary-700 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-inverted">🏨 Hotel PMS</h1>
          <p className="text-xs text-secondary-400 mt-1">Management System</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-800 text-secondary-400 transition md:hidden">
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
        <ul className="space-y-1">
          {renderLinks(configItems)}
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