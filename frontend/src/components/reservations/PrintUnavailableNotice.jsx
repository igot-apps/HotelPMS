import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { shareReceipt } from '../../lib/printReceipt';

/** Shown when the phone did not open its print screen: share or copy the receipt instead. */
export default function PrintUnavailableNotice({ contentId, title }) {
  const [result, setResult] = useState('');
  const share = async () => {
    try { setResult(await shareReceipt(contentId, title)); } catch { setResult('failed'); }
  };
  return (
    <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
      <p className="font-semibold">This phone did not open the print screen.</p>
      <p className="mt-1">Share the receipt (WhatsApp, email, AirDrop, Notes) or open HideOut24 in Safari or Chrome to print it.</p>
      <button type="button" onClick={share} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white">
        <Share2 size={16} /> Share receipt
      </button>
      {result === 'copied' && <p className="mt-2">Receipt copied — paste it where you need it.</p>}
      {result === 'failed' && <p className="mt-2">Could not share from this phone.</p>}
    </div>
  );
}
