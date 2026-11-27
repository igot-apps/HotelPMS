import { Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, BedDouble, Users, Menu, Sparkles, CalendarClock, UserRound } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

/**
 * Phone-only bottom bar for the pages staff use most. It sits below the scrolling
 * content in the layout (not floating over it), so it never covers anything.
 */
export default function MobileTabBar({ onMore, isMenuOpen }) {
  const role = useAuthStore((state) => state.user?.role);
  const permissions = useAuthStore((state) => state.permissions) || [];
  const location = useLocation();
  if (!role) return null;
  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold';
  if (role === 'Housekeeper') {
    // Rooms and Schedule are two views of the same page (?view=schedule).
    const onPage = location.pathname === '/housekeeping';
    const isSchedule = onPage && new URLSearchParams(location.search).get('view') === 'schedule';
    const links = [
      { to: '/housekeeping', icon: Sparkles, label: 'Rooms', active: onPage && !isSchedule },
      { to: '/housekeeping?view=schedule', icon: CalendarClock, label: 'Schedule', active: isSchedule },
      { to: '/profile', icon: UserRound, label: 'Profile', active: location.pathname === '/profile' },
    ];
    return (
      <nav aria-label="Quick navigation" className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex">
          {links.map(({ to, icon: Icon, label, active }) => (
            <Link key={label} to={to} replace={onPage && to.startsWith('/housekeeping')} aria-current={active ? 'page' : undefined} className={`${item} ${active ? 'text-primary-700' : 'text-text-muted'}`}>
              <Icon size={20} strokeWidth={active ? 2.5 : 2} /><span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    );
  }
  const tabs = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    permissions.includes('CanCreateReservation') && { to: '/bookings', icon: CalendarDays, label: 'Bookings' },
    { to: '/rooms', icon: BedDouble, label: 'Rooms' },
    { to: '/guests', icon: Users, label: 'Guests' },
  ].filter(Boolean);
  return (
    <nav aria-label="Quick navigation" className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `${item} ${isActive ? 'text-primary-700' : 'text-text-muted'}`}>
            {({ isActive }) => (<><Icon size={20} strokeWidth={isActive ? 2.5 : 2} /><span>{label}</span></>)}
          </NavLink>
        ))}
        <button type="button" onClick={onMore} aria-expanded={isMenuOpen} aria-controls="hotel-sidebar" className={`${item} text-text-muted`}>
          <Menu size={20} /><span>More</span>
        </button>
      </div>
    </nav>
  );
}
