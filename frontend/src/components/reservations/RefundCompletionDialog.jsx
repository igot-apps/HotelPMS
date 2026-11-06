import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import RefundCompletionForm from './RefundCompletionForm';

export default function RefundCompletionDialog({ request, onClose, onCompleted, onBusyChange }) {
  const dialogRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleBusyChange = value => {
    setBusy(value);
    onBusyChange?.(value);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="refund-completion-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-text shadow-2xl backdrop:bg-slate-950/60 sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="refund-completion-title" className="text-lg font-bold">Record money returned</h2>
          <p className="text-sm text-text-muted">{request.reservation?.confirmationCode || 'Approved refund'}</p>
        </div>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Close refund form" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-muted hover:bg-secondary-50 disabled:opacity-50"><X size={20} /></button>
      </div>
      <RefundCompletionForm request={request} onBusyChange={handleBusyChange} onCompleted={() => { onClose(); onCompleted?.(); }} />
    </dialog>,
    document.body
  );
}
