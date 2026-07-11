import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getPayments, getPaymentStats, recordPayment, refundPayment } from '../api/payments';
import PaymentModal from '../components/payments/PaymentModal';
import { 
  Search, Plus, CreditCard, TrendingUp, Banknote, Smartphone, Undo2, 
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X 
} from 'lucide-react';
import RequirePermission from '../components/RequirePermission';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');

  // ==========================================
  // 1. URL Synchronization (Min/Max Removed)
  // ==========================================
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '10');
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'paymentDate';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const status = searchParams.get('status') || '';
  const paymentMethod = searchParams.get('paymentMethod') || '';
  const fromDate = searchParams.get('fromDate') || '';
  const toDate = searchParams.get('toDate') || '';

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) {
        newParams.delete(key);
      } else {
        newParams.set(key, String(value));
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  // ==========================================
  // 2. Debounced Search Logic
  // ==========================================
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        updateParams({ search: localSearch, page: 1 });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // ==========================================
  // 3. React Query Setup (Min/Max Removed from Key)
  // ==========================================
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['payments', { page, limit, search, sortBy, sortOrder, status, paymentMethod, fromDate, toDate }],
    queryFn: () => {
      const queryParams = { page, limit };
      if (search) queryParams.search = search;
      if (sortBy) queryParams.sortBy = sortBy;
      if (sortOrder) queryParams.sortOrder = sortOrder;
      if (status) queryParams.status = status;
      if (paymentMethod) queryParams.paymentMethod = paymentMethod;
      if (fromDate) queryParams.fromDate = fromDate;
      if (toDate) queryParams.toDate = toDate;
      
      return getPayments(queryParams).then(res => res.data);
    },
    placeholderData: keepPreviousData,
  });

  const payments = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const totalPages = Math.ceil(pagination.total / limit);
  const startItem = pagination.total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, pagination.total);

  const { data: statsData } = useQuery({
    queryKey: ['paymentStats'],
    queryFn: () => getPaymentStats().then(res => res.data.data),
  });

  // ==========================================
  // 4. Mutations
  // ==========================================
  const recordMutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['paymentStats'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
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

  const modalError = recordMutation.error?.response?.data?.message || (recordMutation.isError ? 'Failed to record payment.' : null);

  // ==========================================
  // 5. Handlers
  // ==========================================
  const handleSort = (column) => {
    if (sortBy === column) {
      updateParams({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      updateParams({ sortBy: column, sortOrder: 'asc', page: 1 });
    }
  };

  const handleFilterChange = (key, value) => {
    updateParams({ [key]: value, page: 1 });
  };

  const clearFilters = () => {
    updateParams({
      search: '', status: '', paymentMethod: '', 
      fromDate: '', toDate: '', page: 1 // Min/Max removed
    });
    setLocalSearch('');
  };

  // Updated to only check the remaining filters
  const hasActiveFilters = status || paymentMethod || fromDate || toDate;

  const handleRefund = (id) => {
    if (window.confirm('Are you sure you want to refund this payment?')) {
      refundMutation.mutate(id);
    }
  };

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

  const SortableHeader = ({ column, label }) => {
    const isActive = sortBy === column;
    return (
      <th 
        className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer hover:bg-secondary-100/50 transition select-none"
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {label}
          {isActive && (
            sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Payments & Revenue</h1>
          <p className="text-text-muted text-sm mt-1">Track transactions, filter records, and process payments.</p>
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

      {/* Toolbar: Search & Filters */}
      <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text" 
              placeholder="Search guest, reservation ID, or reference..." 
              value={localSearch} 
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
            />
          </div>
          
          {/* Quick Filters */}
          <select 
            value={status} 
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="Refunded">Refunded</option>
          </select>

          <select 
            value={paymentMethod} 
            onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="Card">Card</option>
            <option value="MobileMoney">Mobile Money</option>
            <option value="Online">Online</option>
          </select>
        </div>

        {/* Advanced Filters (Adjusted to 2 columns for Dates only) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-border">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">From Date</label>
            <input 
              type="date" 
              value={fromDate} 
              onChange={(e) => handleFilterChange('fromDate', e.target.value)} 
              className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20" 
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">To Date</label>
            <input 
              type="date" 
              value={toDate} 
              onChange={(e) => handleFilterChange('toDate', e.target.value)} 
              className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20" 
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-danger-600 hover:text-danger-700 transition">
              <X size={14} /> Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <SortableHeader column="paymentId" label="ID / Date" />
                <SortableHeader column="guestName" label="Guest / Reservation" />
                <SortableHeader column="amount" label="Amount" />
                <SortableHeader column="paymentMethod" label="Method" />
                <SortableHeader column="status" label="Status" />
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted animate-pulse">Loading transactions...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><CreditCard size={24} /> <p className="font-semibold">No payments found</p></td></tr>
              ) : (
                payments.map((p) => {
                  const date = new Date(p.paymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const guestName = p.reservation?.guest?.fullName || 'Unknown Guest';
                  const amount = parseFloat(p.amount || 0).toFixed(2);
                  
                  let methodClass = 'bg-secondary-100 text-secondary-700';
                  if (p.paymentMethod === 'Cash') methodClass = 'bg-success-50 text-success-700';
                  if (p.paymentMethod === 'Card') methodClass = 'bg-primary-50 text-primary-700';
                  if (p.paymentMethod === 'MobileMoney') methodClass = 'bg-warning-50 text-warning-700';

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
                          // 🚨 CRITICAL: ONLY Managers with 'CanIssueRefunds' can see this button!
                          <RequirePermission permission="CanIssueRefunds">
                            <button 
                              onClick={() => handleRefund(p.paymentId)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-danger-200 text-danger-600 hover:bg-danger-50 transition"
                            >
                              <Undo2 size={14} /> Process Refund
                            </button>
                          </RequirePermission>
                        ) : (
                          <span className="text-xs text-text-muted italic">Refunded</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-border bg-secondary-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-text-muted">
              Showing <span className="font-semibold text-text">{startItem}</span> to <span className="font-semibold text-text">{endItem}</span> of <span className="font-semibold text-text">{pagination.total}</span> records
            </p>
            <select 
              value={limit} 
              onChange={(e) => updateParams({ limit: e.target.value, page: 1 })}
              className="text-sm border border-border rounded-lg px-2 py-1 bg-surface text-text outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ page: 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">First</button>
            <button onClick={() => updateParams({ page: page - 1 })} disabled={page === 1 || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"><ChevronLeft size={16} /> Prev</button>
            
            <span className="px-3 py-1 text-sm font-semibold text-text bg-background border border-border rounded-lg min-w-[100px] text-center">
              Page {page} of {totalPages || 1}
            </span>
            
            <button onClick={() => updateParams({ page: page + 1 })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1">Next <ChevronRight size={16} /></button>
            <button onClick={() => updateParams({ page: totalPages })} disabled={page === totalPages || !pagination.total || isPlaceholderData} className="px-2 py-1 text-sm font-medium rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Last</button>
          </div>
        </div>
      </div>

      {/* Modal */}
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          recordMutation.reset();
        }}
        onSubmit={(data) => recordMutation.mutate(data)}
        isLoading={recordMutation.isPending}
        error={modalError}
      />
    </div>
  );
}

// Reusable Stat Card (Unchanged)
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