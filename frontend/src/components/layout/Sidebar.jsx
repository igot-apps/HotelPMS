import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BedDouble, Users, CalendarDays, CreditCard, BarChart3, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/rooms', icon: BedDouble, label: 'Rooms & Inventory' },
  { to: '/guests', icon: Users, label: 'Guests' },
  { to: '/reservations', icon: CalendarDays, label: 'Reservations' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
];

export default function Sidebar() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    // REFACTORED: Using 'secondary' for the dark theme, 'primary' for active states
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-secondary-900 text-secondary-300 flex flex-col transform -translate-x-full md:translate-x-0 transition-transform duration-200 ease-in-out">
      
      {/* Header */}
      <div className="p-6 border-b border-secondary-700">
        <h1 className="text-xl font-bold text-text-inverted">🏨 Hotel PMS</h1>
        <p className="text-xs text-secondary-400 mt-1">Management System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  // REFACTORED: Active state uses 'primary' tokens!
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
          ))}
        </ul>
      </nav>

      {/* Footer / Logout */}
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