import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building2, Eye, EyeOff, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { loginUser } from '../api/auth';
import PlatformPropertiesPage from './PlatformPropertiesPage';
import { useAuthStore } from '../store/authStore';

export default function SuperAdminPage() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accessError, setAccessError] = useState('');

  const isPlatformAccount = isAuthenticated && user?.isPlatformAdmin && user?.propertyId == null;
  const isHotelAccount = isAuthenticated && !isPlatformAccount;

  const signIn = useMutation({
    mutationFn: (credentials) => loginUser(credentials),
    onSuccess: (response) => {
      const { user: signedInUser, accessToken, refreshToken } = response.data.data;
      if (!signedInUser?.isPlatformAdmin || signedInUser?.propertyId != null) {
        setAccessError('This is a hotel account. Sign in with your separate platform administrator account.');
        return;
      }
      login(signedInUser, { accessToken, refreshToken }, signedInUser.permissions || []);
      toast.success('Signed in to platform administration.');
    },
    onError: (error) => setAccessError(error.response?.data?.message || 'Could not sign in. Check your phone number and password.'),
  });

  const submit = (event) => {
    event.preventDefault();
    setAccessError('');
    if (!/^\d{10}$/.test(phone)) {
      setAccessError('Enter the 10-digit phone number for your platform account.');
      return;
    }
    if (!password) {
      setAccessError('Enter your password.');
      return;
    }
    signIn.mutate({ username: phone, password });
  };

  const handleLogout = () => {
    logout();
    setPassword('');
    setAccessError('');
  };

  if (isPlatformAccount) {
    return (
      <div className="min-h-screen bg-background text-text">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white"><Building2 size={21} /></span>
              <span><strong className="block text-sm font-bold sm:text-base">Stayfolio Platform</strong><span className="text-xs text-text-muted">Super administrator</span></span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-right sm:block"><strong className="block text-sm">{user.fullName}</strong><span className="text-xs text-text-muted">Platform administrator</span></span>
              <button onClick={handleLogout} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary-50"><LogOut size={16} /> <span className="hidden sm:inline">Sign out</span></button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <PlatformPropertiesPage />
        </main>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary-900 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-7 shadow-2xl sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white"><ShieldCheck size={24} /></span>
          <span><span className="block text-xs font-bold uppercase tracking-[0.16em] text-primary-700">Stayfolio</span><h1 className="text-xl font-bold text-text">Platform administration</h1></span>
        </div>
        <p className="mb-6 text-sm leading-6 text-text-muted">Sign in with your personal platform account to manage properties across the PMS. Hotel staff accounts cannot access this area.</p>

        {isHotelAccount ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-6 text-warning-800">You are currently signed in to a hotel account. Platform administration uses a separate account.</div>
            <button onClick={handleLogout} className="w-full rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700">Sign out and use platform account</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold text-text" htmlFor="superadmin-phone">Phone number</label>
            <input
              id="superadmin-phone"
              autoComplete="username"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit phone number"
              maxLength={10}
              className="-mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
            <label className="block text-sm font-semibold text-text" htmlFor="superadmin-password">Password</label>
            <div className="relative -mt-2">
              <input
                id="superadmin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
              <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-3 text-text-muted hover:text-text">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {accessError && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{accessError}</p>}
            <button type="submit" disabled={signIn.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 font-semibold text-white shadow-lg shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">
              {signIn.isPending ? <><LoaderCircle className="animate-spin" size={18} /> Signing in…</> : 'Sign in to platform'}
            </button>
          </form>
        )}
        <a href="/login" className="mt-6 block text-center text-sm font-medium text-text-muted hover:text-primary-700">Go to hotel staff sign in</a>
      </section>
    </main>
  );
}
