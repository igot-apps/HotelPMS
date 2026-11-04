import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
export default function ReservationSection({ id, title, icon: Icon, summary, children }) {
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    // New visits start closed. A section-specific shortcut opens its destination.
    section.open = location.hash === `#${id}`;
    if (section.open) section.scrollIntoView({ block: 'start' });
  }, [id, location.key, location.hash]);
  return <details ref={ref} id={id} className="group/section min-w-0 scroll-mt-20 rounded-xl border border-border bg-surface shadow-sm open:border-primary-200"><summary aria-controls={`${id}-content`} className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-4 text-text outline-none transition hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-500 [&::-webkit-details-marker]:hidden sm:px-6">{Icon && <Icon aria-hidden="true" size={20} className="shrink-0 text-primary-600" />}<span className="min-w-0 flex-1"><span className="block text-base font-bold">{title}</span>{summary && <span className="mt-0.5 block break-words text-xs text-text-muted">{summary}</span>}</span><span className="hidden text-xs font-medium text-text-muted sm:block"><span className="group-open/section:hidden">Open</span><span className="hidden group-open/section:inline">Close</span></span><ChevronDown aria-hidden="true" size={20} className="shrink-0 text-text-muted transition-transform group-open/section:rotate-180" /></summary><div id={`${id}-content`} className="min-w-0 border-t border-border p-4 sm:p-6">{children}</div></details>;
}
