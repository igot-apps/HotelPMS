import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPayments, getPaymentStats, recordPayment, refundPayment } from '../api/payments';
import PaymentModal from '../components/payments/PaymentModal';
import { Plus, AlertCircle, CreditCard, TrendingUp, Banknote, Smartphone, Undo2 } from 'lucide-react';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1. Fetch Stats
  const { data: statsData } = useQuery({
    queryKey: ['paymentStats'],
    queryFn: () => getPaymentStats().then(res => res.data.data),
  });

  // 2. Fetch Payments List
  const { data: paymentsData, isLoading, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => getPayments({ limit: 50 }).then(res => res.data),
  });

  const payments = paymentsData?.data || [];

  // 3. Mutations
  const recordMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] }); // Update reservation balances
      setIsModalOpen(false);
    },
  });

  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    },
  });

  const handleRefund = (id) => {
    if (window.confirm('Are you sure you want to refund this payment?')) {
      refundMutation.mutate(id);
    }
  };

  // Extract error for modal
  const modalError = recordMutation.error?.response?.data?.message || (recordMutation.isError ? 'Failed to record payment.' : null);

  // Calculate stats safely (Prisma returns strings for decimals)
  const totalRevenue = parseFloat(statsData?.totalAmount || 0).toFixed(2);
  const totalTx = statsData?.totalPayments || 0;
  
  let cashTotal = 0;
  let digitalTotal = 0;
  if (statsData?.byMethod) {
    statsData.byMethod.forEach(m => {
      const val = parseFloat(m.total || 0);
      if (m.method === 'Cash') cashTotal += val;
      else digitalTotal += val;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Payments & Revenue</h1>
          <p className="text-text-muted text-sm mt-1">Track transactions and process payments.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> Record Payment
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Total Revenue" value={`${totalRevenue} GHS`} color="primary" />
        <StatCard icon={CreditCard} label="Total Transactions" value={totalTx} color="secondary" />
        <StatCard icon={Banknote} label="Cash Collected" value={`${cashTotal.toFixed(2)} GHS`} color="success" />
        <StatCard icon={Smartphone} label="Digital / Card" value={`${digitalTotal.toFixed(2)} GHS`} color="warning" />
      </div>

      {/* Transactions Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold text-text">Transaction History</h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-text-muted animate-pulse">Loading transactions...</div>
        ) : error ? (
          <div className="p-12 text-center text-danger-600 flex flex-col items-center gap-2">
            <AlertCircle size={24} /> <p className="font-semibold">Failed to load payments</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
            <CreditCard size={24} /> <p className="font-semibold">No payments recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">ID / Date</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Guest / Reservation</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const date = new Date(p.paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const guestName = p.reservation?.guest?.fullName || 'Unknown Guest';
                  const amount = parseFloat(p.amount || 0).toFixed(2);
                  
                  // Method Badge
                  let methodClass = 'bg-secondary-100 text-secondary-700';
                  if (p.paymentMethod === 'Cash') methodClass = 'bg-success-50 text-success-700';
                  if (p.paymentMethod === 'Card') methodClass = 'bg-primary-50 text-primary-700';
                  if (p.paymentMethod === 'MobileMoney') methodClass = 'bg-warning-50 text-warning-700';

                  // Status Badge
                  const statusClass = p.status === 'Completed' 
                    ? 'bg-success-50 text-success-700 ring-1 ring-success-600/20' 
                    : 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';

                  return (
                    <tr key={p.paymentId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-text-muted">#{p.paymentId}</p>
                        <p className="text-sm text-text">{date}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-text">{guestName}</p>
                        <p className="text-xs text-text-muted">Res #{p.reservationId}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-text">{amount} GHS</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${methodClass}`}>
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${statusClass}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {p.status === 'Completed' ? (
                          <button 
                            onClick={() => handleRefund(p.paymentId)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"
                          >
                            <Undo2 size={14} /> Refund
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted italic">Refunded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          recordMutation.reset(); // Clears the error state
        }}
        onSubmit={(data) => recordMutation.mutate(data)}
        isLoading={recordMutation.isPending}
        error={modalError}
      />
    </div>
  );
}

// Reusable Stat Card for this page
function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    secondary: 'bg-secondary-100 text-secondary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
  };

  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      </div>
      <h3 className="text-2xl font-bold text-text">{value}</h3>
    </div>
  );
}