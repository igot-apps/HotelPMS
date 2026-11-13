import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import GuestSignInForm from './GuestSignInForm';

export default function PublicAuthModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return <div className="mobile-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Guest sign in" className="relative max-h-[min(90vh,760px)] w-full max-w-md min-w-0 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-8">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-2 text-text-muted hover:bg-secondary-100"><X size={20} /></button>
      <div className="pr-9"><GuestSignInForm onSuccess={onClose} /></div>
      <div className="mt-6 border-t border-border pt-5 text-center text-sm"><span className="text-text-muted">Hotel team? </span><Link to="/hotel/login" onClick={onClose} className="font-semibold text-primary-700 hover:underline">Staff sign in</Link></div>
    </section>
  </div>;
}
