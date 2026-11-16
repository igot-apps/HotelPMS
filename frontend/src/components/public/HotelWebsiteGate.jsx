import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import api from '../../lib/axios';
import { HotelWebsiteContext, isHotelWebsiteHost } from '../../lib/hotelWebsite';
import { STAFF_ENTRY_PATHS, staffLoginUrl } from '../../lib/platformConfig';

function StaffLoginRedirect({ website }) {
  const target = staffLoginUrl(website);
  useEffect(() => { window.location.replace(target); }, [target]);
  return <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-text-muted">Opening staff sign-in…</div>;
}

function StaffLoginFooter({ website }) {
  return (
    <footer className="border-t border-border bg-background px-4 py-6 text-center text-xs text-text-muted">
      © {new Date().getFullYear()} {website.propertyName}
      <span className="mx-2">·</span>
      <a href={staffLoginUrl(website)} className="hover:text-primary-600 hover:underline">Staff login</a>
    </footer>
  );
}

export default function HotelWebsiteGate({ children }) {
  const location = useLocation();
  const isHotelHost = isHotelWebsiteHost();
  const hostname = window.location.hostname.toLowerCase();
  const { data: website, isPending, isError } = useQuery({
    queryKey: ['hotelWebsite', hostname],
    queryFn: async () => (await api.get('/public/website', { params: { hostname }, skipErrorToast: true })).data.data,
    enabled: isHotelHost,
    retry: false,
  });

  if (!isHotelHost) return children;
  if (isPending) return <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-text-muted">Opening hotel website…</div>;
  if (isError || !website) return <main className="flex min-h-screen items-center justify-center bg-background px-4"><div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-sm"><h1 className="text-xl font-bold text-text">Hotel website unavailable</h1><p className="mt-2 text-sm text-text-muted">This address is not connected to an active hotel website. Please check the address or contact the hotel.</p></div></main>;

  if (STAFF_ENTRY_PATHS.includes(location.pathname.replace(/\/+$/, ''))) return <StaffLoginRedirect website={website} />;

  const hotelPath = `/public/${website.propertyCode}`;
  const allowed = location.pathname === hotelPath
    || location.pathname.startsWith(`${hotelPath}/`)
    || ['/public/auth', '/public/reservations'].includes(location.pathname);
  if (!allowed) return <Navigate to={`${hotelPath}${location.pathname === '/' ? location.search : ''}`} replace />;
  return <HotelWebsiteContext.Provider value={website}>{children}<StaffLoginFooter website={website} /></HotelWebsiteContext.Provider>;
}
