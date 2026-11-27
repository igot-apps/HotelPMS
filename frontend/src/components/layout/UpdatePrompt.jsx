import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { reloadForUpdate, useUpdateAvailable } from '../../lib/appVersion';

/** Optional "new version" strip in the page flow. Nothing reloads until staff tap Update. */
export default function UpdatePrompt() {
  const available = useUpdateAvailable();
  const [dismissed, setDismissed] = useState(false);
  const [note, setNote] = useState('');
  if (!available || dismissed) return null;
  const update = () => {
    const result = reloadForUpdate();
    if (result === 'saving') setNote('A save is still in progress — tap Update again when it finishes.');
  };
  return (
    <div role="status" className="relative z-[70] flex shrink-0 flex-wrap items-center gap-2 border-b border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900 sm:px-4 md:px-8">
      <RefreshCw size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">A new version of HideOut24 is available.{note && ` ${note}`}</span>
      <button type="button" onClick={update} className="min-h-9 rounded-lg bg-primary-600 px-3 py-1 font-semibold text-white">Update</button>
      <button type="button" onClick={() => setDismissed(true)} className="min-h-9 rounded-lg px-3 py-1 font-semibold text-primary-800">Later</button>
    </div>
  );
}
