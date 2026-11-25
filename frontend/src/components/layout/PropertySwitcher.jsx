import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { switchProperty } from '../../api/auth';
import AddPropertyDialog from './AddPropertyDialog';

// Start the new property from a clean page: no cached data, timers or in-flight
// requests from the previous property survive a full reload.
export async function openProperty(propertyId, queryClient, path = '/dashboard') {
  const { data } = await switchProperty(propertyId);
  const session = data.data;
  queryClient?.cancelQueries(); queryClient?.clear();
  useAuthStore.getState().login(session.user, { accessToken: session.accessToken, refreshToken: session.refreshToken }, session.user.permissions);
  window.location.assign(path);
}

export default function PropertySwitcher() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const menu = useRef(null);
  const properties = user?.properties || [];
  const canSwitch = properties.length > 1 || user?.canAddProperty;

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (menu.current && !menu.current.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', escape); };
  }, [open]);

  const badge = (
    <>
      <Building2 size={16} className="shrink-0 text-primary-600" />
      <span className="text-sm font-semibold text-text truncate max-w-[150px] md:max-w-xs" title={user?.propertyName || 'No Property'}>
        {user?.propertyName || 'No Property'}
      </span>
    </>
  );

  if (!canSwitch) {
    return <div className="min-w-0 flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-secondary-50 border border-border rounded-lg">{badge}</div>;
  }

  const choose = async (propertyId) => {
    if (propertyId === user.propertyId) { setOpen(false); return; }
    setBusy(propertyId);
    try {
      await openProperty(propertyId, queryClient);
    } catch {
      setBusy(null); // the request interceptor already explained why
    }
  };

  return (
    <div ref={menu} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current property: ${user?.propertyName || 'none'}. Switch property`}
        className="min-w-0 min-h-11 flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-secondary-50 border border-border rounded-lg hover:border-primary-500 transition"
      >
        {badge}
        <ChevronDown size={16} className="shrink-0 text-text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-surface shadow-xl z-50 overflow-hidden">
          <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Your properties</p>
          <ul className="max-h-72 overflow-y-auto py-1">
            {properties.map((p) => {
              const current = p.propertyId === user.propertyId;
              return (
                <li key={p.propertyId}>
                  <button
                    type="button" role="menuitemradio" aria-checked={current}
                    disabled={busy !== null}
                    onClick={() => choose(p.propertyId)}
                    className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary-50 disabled:opacity-60 ${current ? 'bg-primary-50' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">{p.propertyName}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {[p.city, !p.isActive ? 'Deactivated' : p.expired ? 'Subscription ended' : null].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </span>
                    {busy === p.propertyId ? <Loader2 size={16} className="animate-spin text-primary-600" /> : current ? <Check size={16} className="text-primary-600" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {user?.canAddProperty && (
            <button
              type="button" role="menuitem"
              onClick={() => { setOpen(false); setAdding(true); }}
              className="w-full min-h-11 flex items-center gap-2 px-3 py-2 border-t border-border text-sm font-semibold text-primary-700 hover:bg-secondary-50"
            >
              <Plus size={16} /> Add property
            </button>
          )}
        </div>
      )}
      {adding && <AddPropertyDialog onClose={() => setAdding(false)} onAdded={(property) => openProperty(property.propertyId, queryClient, '/billing').catch(() => {})} />}
    </div>
  );
}
