import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Crown, LogOut, UserRound } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { disablePushOnSignOut } from '../../lib/push';

/** Avatar button in the top bar: who is signed in, account shortcuts and Sign out. */
export default function UserMenu() {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions) || [];
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const signOut = async () => { setOpen(false); await disablePushOnSignOut(); logout(); navigate('/login'); };
  const link = 'flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-medium text-text hover:bg-secondary-50';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-text-inverted hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
        {user?.fullName?.charAt(0).toUpperCase() || 'U'}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-text">{user?.fullName || 'User'}</p>
            <p className="truncate text-xs text-text-muted">{user?.role || 'Staff'}{user?.propertyName ? ` · ${user.propertyName}` : ''}</p>
          </div>
          <Link role="menuitem" to="/profile" onClick={() => setOpen(false)} className={link}><UserRound size={16} /> My profile & password</Link>
          {user?.role === 'Manager' && <Link role="menuitem" to="/properties" onClick={() => setOpen(false)} className={link}><Building2 size={16} /> Property settings</Link>}
          {permissions.includes('CanManageBilling') && <Link role="menuitem" to="/billing" onClick={() => setOpen(false)} className={link}><Crown size={16} /> Billing & Plan</Link>}
          <button role="menuitem" type="button" onClick={signOut} className={`${link} w-full text-danger-700`}><LogOut size={16} /> Sign out</button>
        </div>
      )}
    </div>
  );
}
