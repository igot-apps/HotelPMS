import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';

// Typed names match ignoring case and extra spaces.
export const sameName = (a, b) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Confirm deleting a branch the owner added that was never subscribed.
// The owner types the property's name so it cannot be deleted by a stray tap.
export default function DeleteBranchDialog({ property, deleting, error, onCancel, onConfirm }) {
  const cancelButton = useRef(null);
  const [typed, setTyped] = useState('');
  const matches = sameName(typed, property.propertyName);
  const latest = useRef({ onCancel, deleting });
  latest.current = { onCancel, deleting };

  // Focus the safe choice first; Escape cancels unless a delete is running.
  useEffect(() => { cancelButton.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const escape = (event) => { if (event.key === 'Escape' && !latest.current.deleting) latest.current.onCancel(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="delete-branch-title" aria-describedby="delete-branch-body" className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-xl">
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600"><AlertTriangle size={20} /></span>
            <h2 id="delete-branch-title" className="pt-2 text-lg font-bold text-text">Delete {property.propertyName}?</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={deleting} aria-label="Close" className="p-2 rounded-lg hover:bg-secondary-50 text-text-muted"><X size={20} /></button>
        </header>
        <div id="delete-branch-body" className="min-h-0 flex-1 overflow-y-auto space-y-3 px-4 py-3 text-sm text-text-muted">
          <p>This permanently removes the property and everything in it: rooms, bookings, staff access and records.</p>
          <p className="rounded-lg border border-danger-200 bg-danger-50 p-3 font-semibold text-danger-700">This cannot be undone.</p>
          <p>Your other properties are not affected.</p>
          <div>
            <label htmlFor="delete-branch-name" className="block text-sm font-semibold text-text mb-1">Type <span className="font-bold">{property.propertyName}</span> to confirm</label>
            <input id="delete-branch-name" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches && !deleting) onConfirm(typed); }} disabled={deleting} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={property.propertyName} className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-danger-500/20 focus:border-danger-500" />
          </div>
          {error && <p role="alert" className="text-danger-600 font-semibold">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button ref={cancelButton} type="button" onClick={onCancel} disabled={deleting} className="min-h-11 px-4 rounded-lg border border-border font-semibold text-text">Keep property</button>
          <button type="button" onClick={() => onConfirm(typed)} disabled={deleting || !matches} className="min-h-11 px-4 rounded-lg bg-danger-600 text-white font-semibold inline-flex items-center gap-2 hover:bg-danger-700 disabled:opacity-60">
            {deleting && <Loader2 size={16} className="animate-spin" />} Delete property
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
