import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { recordPayment } from '../../api/payments';

const field = 'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-text outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

// Record a desk payment straight from a booking row. Same request and fields as the
// reservation details page, prefilled with the balance due.
export default function TakePaymentDialog({ reservation, onClose }) {
  const queryClient = useQueryClient();
  const balanceDue = Math.max(0, Number(reservation.totalAmount || 0) - Number(reservation.amountPaid || 0));
  const [form, setForm] = useState({ amount: '', paymentMethod: 'Cash', gatewayReference: '', notes: '' });
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const mutation = useMutation({
    mutationFn: () => recordPayment({ reservationId: reservation.reservationId, amount: parseFloat(form.amount), paymentMethod: form.paymentMethod, gatewayReference: form.gatewayReference || null, notes: form.notes || null }),
    onSuccess: () => {
      for (const key of ['reservations', 'reservation', 'reservationStats', 'payments', 'dashboardGlance', 'checkoutAlerts', 'owedAfterCheckout']) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(`Payment of GHS ${parseFloat(form.amount).toFixed(2)} recorded.`);
      onClose();
    },
  });
  const guest = reservation.guestNameSnapshot || reservation.platformGuest?.fullName || reservation.propertyGuest?.fullName || 'Guest';

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="take-payment-title">
      <form onSubmit={(event) => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }} className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id="take-payment-title" className="flex items-center gap-2 text-xl font-bold text-text"><Wallet size={20} className="text-primary-600" /> Take payment</h2>
            <p className="mt-1 text-xs text-text-muted">{guest} · {reservation.confirmationCode} · Balance due: <strong className="text-danger-700">{balanceDue.toFixed(2)} GHS</strong></p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-secondary-100"><X size={20} /></button>
        </div>
        <div className="space-y-4 p-5">
          {mutation.isError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-600"><AlertCircle size={16} className="mt-0.5 shrink-0" />{mutation.error?.response?.data?.message || 'Failed to record payment'}</p>}
          <label className="block text-sm font-semibold text-text">Amount (GHS)
            <input type="number" step="0.01" min="0.01" name="amount" required value={form.amount} onChange={change} placeholder={balanceDue.toFixed(2)} inputMode="decimal" className={`${field} mt-1.5`} />
          </label>
          <label className="block text-sm font-semibold text-text">Payment method
            <select name="paymentMethod" value={form.paymentMethod} onChange={change} className={`${field} mt-1.5`}>
              <option value="Cash">Cash</option>
              <option value="Card">Credit/Debit Card</option>
              <option value="MobileMoney">Mobile Money</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-text">Reference (optional)
            <input type="text" name="gatewayReference" value={form.gatewayReference} onChange={change} placeholder="e.g. MoMo transaction ID" className={`${field} mt-1.5`} />
          </label>
          <label className="block text-sm font-semibold text-text">Note (optional)
            <input type="text" name="notes" value={form.notes} onChange={change} placeholder="e.g. Part payment" className={`${field} mt-1.5`} />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-border p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-text hover:bg-secondary-50">Cancel</button>
          <button disabled={mutation.isPending || !(parseFloat(form.amount) > 0)} className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-text-inverted hover:bg-primary-700 disabled:opacity-50">{mutation.isPending && <Loader2 size={16} className="animate-spin" />} Save payment</button>
        </div>
      </form>
    </div>
  );
}
