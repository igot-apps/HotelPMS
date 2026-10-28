import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    let isCurrent = true;
    if (!accessToken) return undefined;
    api.get('/auth/me').then((response) => {
      if (isCurrent && response.data?.success && response.data?.data) {
        useAuthStore.setState((state) => ({ user: { ...state.user, ...response.data.data } }));
      }
    }).catch(() => {});
    return () => { isCurrent = false; };
  }, [accessToken]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen bg-background text-text">
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
      <div className="flex-1 flex flex-col overflow-hidden ml-0 md:ml-64">
        <Topbar onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
