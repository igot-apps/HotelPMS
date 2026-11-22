import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { serverNow } from '../../lib/serverClock';
import useServerClock from '../../lib/useServerClock';
import { loadTestClock, moveTestClock, useTestClock } from '../../lib/testClock';
import { formatDuration } from '../../lib/stayTiming';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const toLocalInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// TEST ONLY: shown when the server runs with ENABLE_TEST_CLOCK=true. Moves "today" so a
// multi-night stay can be tested in minutes. Never appears on the live server.
export default function TestClockBar() {
  const { enabled, offsetMs } = useTestClock();
  useServerClock();
  const [now, setNow] = useState(() => serverNow());
  const [jumpTo, setJumpTo] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadTestClock(); }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setNow(serverNow());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [enabled]);
  if (!enabled) return null;

  const move = async (body) => {
    setBusy(true);
    try { await moveTestClock(body); } catch { setBusy(false); }
  };
  const shown = now
    ? now.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '…';
  const shift = offsetMs === 0 ? 'real time' : `${offsetMs > 0 ? '+' : '−'}${formatDuration(Math.abs(Math.round(offsetMs / 60000)) * 60000)} from real time`;
  const btn = 'min-h-8 rounded-md border border-violet-300 bg-white px-2.5 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50';

  return (
    <div role="region" aria-label="Test clock" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-violet-400 bg-violet-50 p-2.5 text-sm text-violet-900">
      <span className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
        <FlaskConical size={13} /> Test clock
      </span>
      <span className="font-semibold">{shown}</span>
      <span className="text-xs text-violet-700">({shift})</span>
      <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
        <button type="button" className={btn} disabled={busy} onClick={() => move({ addMs: HOUR })}>+1 hour</button>
        <button type="button" className={btn} disabled={busy} onClick={() => move({ addMs: DAY })}>+1 day</button>
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (jumpTo) move({ to: new Date(jumpTo).toISOString() }); }}>
          <input
            type="datetime-local"
            aria-label="Jump to date and time"
            value={jumpTo}
            onFocus={() => { if (!jumpTo && now) setJumpTo(toLocalInput(now)); }}
            onChange={(e) => setJumpTo(e.target.value)}
            className="min-h-8 rounded-md border border-violet-300 bg-white px-2 text-xs"
          />
          <button type="submit" className={btn} disabled={busy || !jumpTo}>Jump</button>
        </form>
        {offsetMs !== 0 && (
          <button type="button" className="min-h-8 rounded-md border border-violet-600 bg-violet-600 px-2.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50" disabled={busy} onClick={() => move({ reset: true })}>
            Back to real time
          </button>
        )}
      </div>
    </div>
  );
}
