import { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { CLOCK_NOTICE_MS, deviceClockOffset } from '../../lib/serverClock';
import useServerClock from '../../lib/useServerClock';
import { formatDuration } from '../../lib/stayTiming';
import { useTestClock } from '../../lib/testClock';

const KEY = 'clockNoticeDismissed';
const read = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

// One small, dismissible note when this computer's clock is clearly wrong. Nothing depends on it:
// HideOut24 already uses the server's time for every time-based rule.
export default function ClockNotice() {
  useServerClock();
  const [dismissed, setDismissed] = useState(read);
  const testClock = useTestClock();
  const offset = deviceClockOffset();
  if (testClock.enabled || dismissed || offset === null || Math.abs(offset) < CLOCK_NOTICE_MS) return null;
  const close = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ } setDismissed(true); };
  return (
    <div role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">
      <Clock size={16} className="mt-0.5 shrink-0" />
      <p className="flex-1">This computer's clock is {formatDuration(Math.round(Math.abs(offset) / 60000) * 60000)} {offset > 0 ? 'behind' : 'ahead'}. HideOut24 is using the hotel server's time, so nothing is affected.</p>
      <button type="button" onClick={close} aria-label="Dismiss" className="flex min-h-8 min-w-8 items-center justify-center rounded text-warning-800 hover:bg-warning-100"><X size={16} /></button>
    </div>
  );
}
