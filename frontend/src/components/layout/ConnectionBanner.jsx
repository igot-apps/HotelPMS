import { WifiOff, Loader2 } from 'lucide-react';
import { useConnectionStatus } from '../../lib/connectionStatus';

/**
 * A slim strip in the page flow (never floating over buttons) that says when the phone is offline,
 * the server is not answering, or a save is taking long. Nothing is queued while offline.
 */
export default function ConnectionBanner() {
  const { offline, unreachable, slow } = useConnectionStatus();
  if (!offline && !unreachable && !slow) return null;
  const problem = offline || unreachable;
  const text = offline
    ? 'You are offline. Changes cannot be saved until the connection is back.'
    : unreachable
      ? 'Cannot reach the server. Check your connection — the page will update when it is back.'
      : 'Still working… the connection is slow. Please wait — do not tap again.';
  return (
    <div data-connection-banner role="status" aria-live="polite" className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 text-sm font-medium sm:px-4 md:px-8 ${problem ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
      {problem ? <WifiOff size={16} className="shrink-0" /> : <Loader2 size={16} className="shrink-0 animate-spin" />}
      <span>{text}</span>
    </div>
  );
}
