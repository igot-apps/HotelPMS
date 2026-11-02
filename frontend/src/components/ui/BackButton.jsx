import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function BackButton({ fallback = '/discover', label = 'Back', mobileOnly = false, confirmWhen = false, disabled = false, onBack, useHistory = true, className = '' }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (disabled) return;
    if (confirmWhen && !window.confirm('Leave this page? Your unsaved changes will be lost.')) return;
    if (onBack) { onBack(); return; }
    // React Router's index tracks in-app history. A direct link gets a safe destination.
    if (useHistory && Number.isInteger(window.history.state?.idx) && window.history.state.idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
  return <button type="button" onClick={goBack} disabled={disabled} aria-label={label} className={`${mobileOnly ? 'inline-flex md:hidden' : 'inline-flex'} min-h-11 max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-muted shadow-sm transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}><ArrowLeft size={18} className="shrink-0" /><span>{label}</span></button>;
}
