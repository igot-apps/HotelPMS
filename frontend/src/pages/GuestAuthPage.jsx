import { useLocation, useNavigate, useParams } from 'react-router-dom';
import GuestSignInForm from '../components/public/GuestSignInForm';
import BackButton from '../components/ui/BackButton';

export default function GuestAuthPage() {
  const { propertyCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || `/public/${propertyCode}`;
  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8"><section className="w-full max-w-md min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-xl sm:p-8"><BackButton fallback={`/public/${propertyCode}`} label="Back to hotel" className="mb-6" /><GuestSignInForm onSuccess={() => navigate(from, { replace: true })} /></section></main>;
}
