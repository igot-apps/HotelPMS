import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { disablePush, enablePush, pushState, sendTestPush } from '../../lib/push';

const WHAT_YOU_GET = {
  Manager: ['New online bookings and online payments', 'Refunds recorded by staff', 'Cash count problems', 'Overstays that need attention', 'Your plan about to expire'],
  Receptionist: ['New online bookings and online payments', 'Guests past checkout time'],
  Housekeeper: [],
};

const button = 'inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60';

/** "Notifications on this device" on My profile. Each phone/computer is switched on separately. */
export default function NotificationsCard({ role, cardClassName }) {
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const items = WHAT_YOU_GET[role] || [];

  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);

  const run = async (action) => {
    setBusy(true);
    try {
      if (action === 'on') { await enablePush(); setState('on'); toast.success('Notifications are on for this device.'); }
      if (action === 'off') { await disablePush(); setState('off'); toast.success('Notifications are off for this device.'); }
      if (action === 'test') {
        const res = await sendTestPush();
        if (res.data?.data?.sent) toast.success('Test sent. It should arrive in a few seconds.');
        else toast.error('No device received it. Turn notifications off and on again.');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not change notifications.');
      setState(await pushState().catch(() => 'unsupported'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cardClassName} aria-labelledby="notifications-title">
      <h2 id="notifications-title" className="flex items-center gap-2 font-bold text-text"><Bell size={18} className="text-primary-600" /> Notifications on this device</h2>
      {items.length > 0
        ? <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">{items.map((item) => <li key={item}>{item}</li>)}</ul>
        : <p className="text-sm text-text-muted">There are no notifications for your role yet.</p>}

      {state === 'loading' && <p className="text-sm text-text-muted">Checking this device…</p>}
      {state === 'install' && (
        <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">
          On iPhone, notifications only work from the HideOut24 app on your Home Screen. In Safari tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, open HideOut24 from the new icon, then come back here.
        </p>
      )}
      {state === 'unsupported' && <p className="text-sm text-text-muted">This browser cannot receive notifications. Try Chrome, Edge or Safari (iPhone: the Home Screen app).</p>}
      {state === 'denied' && (
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-800">
          Notifications are blocked for HideOut24 on this device. Allow them in your phone or browser settings (iPhone: Settings → Notifications → HideOut24), then reload.
        </p>
      )}
      {state === 'off' && items.length > 0 && (
        <button type="button" disabled={busy} onClick={() => run('on')} className={`${button} bg-primary-600 text-white hover:bg-primary-700`}>
          <Bell size={16} /> {busy ? 'Turning on…' : 'Turn on notifications'}
        </button>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-sm font-semibold text-success-700"><Bell size={14} /> On for this device</span>
          <button type="button" disabled={busy} onClick={() => run('test')} className={`${button} border border-border text-primary-700 hover:bg-primary-50`}><Send size={16} /> Send a test</button>
          <button type="button" disabled={busy} onClick={() => run('off')} className={`${button} border border-border text-text-muted hover:bg-secondary-50`}><BellOff size={16} /> Turn off</button>
        </div>
      )}
      <p className="text-xs text-text-muted">Signing out turns notifications off on this device, so the next person using it doesn't get yours.</p>
    </section>
  );
}
