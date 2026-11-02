import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
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

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-dvh bg-background text-text">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
