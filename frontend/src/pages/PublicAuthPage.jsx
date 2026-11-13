import { Link, useLocation, useNavigate } from 'react-router-dom';
import GuestSignInForm from '../components/public/GuestSignInForm';
import BrandMark from '../components/ui/BrandMark';
import BackButton from '../components/ui/BackButton';

export default function PublicAuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/discover';
  return <div className="flex min-h-screen flex-col bg-background">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4"><Link to="/discover" className="flex items-center gap-2"><BrandMark className="h-8 w-8" /><span className="font-black text-text">HideOut24</span></Link><BackButton fallback="/discover" label="Back" /></div></header>
    <main className="flex flex-1 items-center justify-center px-4 py-8"><section className="w-full max-w-md min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-xl sm:p-8"><GuestSignInForm onSuccess={() => navigate(from, { replace: true })} /></section></main>
  </div>;
}
