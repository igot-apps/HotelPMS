import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Building2, Eye, EyeOff, LoaderCircle, LogOut, ShieldCheck, UserCog, Users } from 'lucide-react';
import BrandMark from '../components/ui/BrandMark';
import toast from 'react-hot-toast';
import { platformLogin } from '../api/platformAdmins';
import PlatformPropertiesPage from './PlatformPropertiesPage';
import PlatformAdminsPage from './PlatformAdminsPage';
import PlatformAccountPage from './PlatformAccountPage';
import { usePlatformAuthStore } from '../store/platformAuthStore';

const TABS = [
  { id: 'hotels', label: 'Hotels', icon: Building2 },
  { id: 'admins', label: 'Administrators', icon: Users },
  { id: 'account', label: 'My account', icon: UserCog },
];

export default function SuperAdminPage() {
  // Separate from the hotel staff session (useAuthStore), so both can be open in one browser.
  const user = usePlatformAuthStore((state) => state.user);
  const isAuthenticated = usePlatformAuthStore((state) => state.isAuthenticated);
  const login = usePlatformAuthStore((state) => state.login);
  const logout = usePlatformAuthStore((state) => state.logout);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [tab, setTab] = useState('hotels');

  const signIn = useMutation({
    mutationFn: ({ email, password: pw }) => platformLogin(email, pw),
    onSuccess: (response) => {
      const { user: signedInUser, accessToken, refreshToken } = response.data.data;
      login(signedInUser, { accessToken, refreshToken });
      setPassword('');
      toast.success('Signed in to platform administration.');
    },
    onError: (error) => setAccessError(error.response?.data?.message || 'Could not sign in. Check your email and password.'),
  });

  const submit = (event) => {
    event.preventDefault();
    setAccessError('');
    const value = identifier.trim();
    const isLegacyPhone = /^\d{10}$/.test(value);
    if (!isLegacyPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setAccessError('Enter your administrator email address.'); return; }
    if (!password) { setAccessError('Enter your password.'); return; }
    signIn.mutate({ email: value, password });
  };

  const handleLogout = () => { logout(); setPassword(''); setAccessError(''); setTab('hotels'); };

  if (isAuthenticated && user) {
    return (
      <div className="min-h-screen bg-background text-text">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <BrandMark className="h-10 w-10" />
              <span><strong className="block text-sm font-bold sm:text-base">HideOut24 Platform</strong><span className="text-xs text-text-muted">Super administrator</span></span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-right sm:block"><strong className="block text-sm">{user.fullName}</strong><span className="text-xs text-text-muted">{user.email || 'Platform administrator'}</span></span>
              <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary-50"><LogOut size={16} /> <span className="hidden sm:inline">Sign out</span></button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8" aria-label="Platform sections">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold ${tab === id ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-muted hover:text-text'}`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {!user.email && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-6 text-warning-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>Your account has no verified email yet. <button onClick={() => setTab('account')} className="font-semibold underline">Add one under My account</button> — you will need it to reset your password. Phone sign-in stops once your email is verified.</span>
            </div>
          )}
          {tab === 'hotels' && <PlatformPropertiesPage />}
          {tab === 'admins' && <PlatformAdminsPage currentUserId={user.userId} />}
          {tab === 'account' && <PlatformAccountPage />}
        </main>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary-900 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-7 shadow-2xl sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white"><ShieldCheck size={24} /></span>
          <span><span className="block text-xs font-bold uppercase tracking-[0.16em] text-primary-700">HideOut24</span><h1 className="text-xl font-bold text-text">Platform administration</h1></span>
        </div>
        <p className="mb-6 text-sm leading-6 text-text-muted">Sign in with your personal administrator account. Hotel staff accounts cannot access this area.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-semibold text-text" htmlFor="superadmin-email">Email</label>
          <input id="superadmin-email" type="text" autoComplete="username" inputMode="email" value={identifier}
            onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com" maxLength={200}
            className="-mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
          <label className="block text-sm font-semibold text-text" htmlFor="superadmin-password">Password</label>
          <div className="relative -mt-2">
            <input id="superadmin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
            <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-3 text-text-muted hover:text-text">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {accessError && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{accessError}</p>}
          <button type="submit" disabled={signIn.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">
            {signIn.isPending ? <><LoaderCircle className="animate-spin" size={18} /> Signing in…</> : 'Sign in to platform'}
          </button>
          <Link to="/superadmin/reset-password" className="block text-center text-sm font-semibold text-primary-700 hover:underline">Forgot your password?</Link>
          <p className="text-center text-xs text-text-muted">Original administrator without an email yet? Enter your 10-digit phone number instead.</p>
        </form>
        <a href="/login" className="mt-6 block text-center text-sm font-medium text-text-muted hover:text-primary-700">Go to hotel staff sign in</a>
      </section>
    </main>
  );
}
