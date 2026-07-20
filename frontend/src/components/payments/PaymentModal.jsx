import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { getActiveReservationsForPayment } from '../../api/payments';
import { useAuthStore } from '../../store/authStore';

export default function PaymentModal({ isOpen, onClose, onSubmit, isLoading, error }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const [reservations, setReservations] = useState([]);
  const [formData, setFormData] = useState({
    reservationId: '',
    amount: '',
    paymentMethod: 'Cash',
    gatewayReference: '',
    notes: '',
  });

  useEffect(() => {
    if (isOpen && propertyId) {
      getActiveReservationsForPayment(propertyId)
        .then(res => {
          const active = (res.data.data || []).filter(r =>
            r.status !== 'Cancelled' && parseFloat(r.balanceDue) > 0
          );
          setReservations(active);
        })
        .catch(err => console.error(err));
    }
  }, [isOpen, propertyId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      reservationId: parseInt(formData.reservationId),
      amount: parseFloat(formData.amount),
      paymentMethod: formData.paymentMethod,
      gatewayReference: formData.gatewayReference || null,
      notes: formData.notes || null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">Record Payment</h2>
            <p className="text-sm text-text-muted mt-1">Process a payment for a reservation.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Select Reservation *</label>
            <select
              name="reservationId"
              value={formData.reservationId}
              onChange={handleChange}
              required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
            >
              <option value="">Choose a reservation...</option>
              {reservations.map(r => (
                <option key={r.reservationId} value={r.reservationId}>
                  #{r.reservationId} - {r.platformGuest?.fullName || r.propertyGuest?.fullName || 'Unknown Guest'} (Balance: {parseFloat(r.balanceDue).toFixed(2)} GHS)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Amount (GHS) *</label>
              <input
                type="number"
                step="0.01"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Payment Method *</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Credit/Debit Card</option>
                <option value="MobileMoney">Mobile Money</option>
                <option value="Online">Online Transfer</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Gateway / Reference ID</label>
            <input
              type="text"
              name="gatewayReference"
              value={formData.gatewayReference}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g., MM-REF-12345 (Optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
            <input
              type="text"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g., Partial payment for room charge"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}