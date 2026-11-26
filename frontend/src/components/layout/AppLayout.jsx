import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileTabBar from './MobileTabBar';
import BackButton from '../ui/BackButton';
import ClockNotice from './ClockNotice';
import TestClockBar from './TestClockBar';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setIsSidebarOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!isSidebarOpen) return undefined;
    const escape = event => { if (event.key === 'Escape') setIsSidebarOpen(false); };
    const desktop = window.matchMedia('(min-width: 768px)');
    const resized = () => { if (desktop.matches) setIsSidebarOpen(false); };
    window.addEventListener('keydown', escape);
    desktop.addEventListener('change', resized);
    return () => { window.removeEventListener('keydown', escape); desktop.removeEventListener('change', resized); };
  }, [isSidebarOpen]);
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.user?.role);
  const home = role === 'Housekeeper' ? '/housekeeping' : '/dashboard';
  const showBack = location.pathname !== home && !/^\/bookings\/[^/]+$/.test(location.pathname);

  useEffect(() => {
    let isCurrent = true;
    if (!accessToken) return undefined;
    api.get('/auth/me').then((response) => {
      if (isCurrent && response.data?.success && response.data?.data) {
        useAuthStore.setState((state) => ({
          user: { ...state.user, ...response.data.data },
          permissions: response.data.data.permissions || [],
        }));
      }
    }).catch(() => {});
    return () => { isCurrent = false; };
  }, [accessToken]);

  // Another tab switched property (or signed out): reload so this tab never
  // shows one property's data while sending another property's token.
  const activePropertyId = useAuthStore((state) => state.user?.propertyId);
  useEffect(() => {
    const changed = (event) => {
      if (event.key !== 'hotel-pms-auth') return;
      let next = null;
      try { next = JSON.parse(event.newValue || 'null')?.state?.user?.propertyId ?? null; } catch { /* treat as signed out */ }
      if (next !== (activePropertyId ?? null)) window.location.reload();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [activePropertyId]);
  useEffect(() => {
    if (useAuthStore.getState().user?.properties?.length > 1 && activePropertyId) document.title = `${useAuthStore.getState().user.propertyName} · HideOut24`;
  }, [activePropertyId]);

  // Lock the page frame while the staff app is shown (public/guest pages keep normal page scrolling).
  useEffect(() => {
    document.documentElement.classList.add('app-shell');
    return () => document.documentElement.classList.remove('app-shell');
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-dvh bg-background text-text pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      
      {/* Mobile Overlay (Dark background when sidebar is open) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={closeSidebar}
        ></div>
      )}

      {/* Main Content Area */}
      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden ml-0 md:ml-64">
        <Topbar onMenuClick={toggleSidebar} isMenuOpen={isSidebarOpen} />
        <main id="main-content" className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-4 md:p-8" inert={isSidebarOpen ? true : undefined}>
          {/* Mobile back button on every page except the home page (and pages that have their own). */}
          {showBack && <div className="mb-3 md:hidden"><BackButton mobileOnly fallback={home} label="Back" /></div>}
          <TestClockBar />
          <ClockNotice />
          <Outlet />
        </main>
        <MobileTabBar onMore={toggleSidebar} isMenuOpen={isSidebarOpen} />
      </div>
    </div>
  );
}
