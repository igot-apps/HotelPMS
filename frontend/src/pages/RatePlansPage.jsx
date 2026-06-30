import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRatePlans, createRatePlan, updateRatePlan, deleteRatePlan } from '../api/ratePlans';
import { getRoomTypes } from '../api/roomTypes';
import { useAuthStore } from '../store/authStore';
import RatePlanModal from '../components/catalog/RatePlanModal';
import { Search, Plus, Edit2, Trash2, Tags, AlertCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

export default function RatePlansPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');

  // 1. Fetch Rate Plans
  const { data, isLoading, error } = useQuery({
    queryKey: ['ratePlans', propertyId, page, roomTypeFilter],
    queryFn: () => {
      const params = { propertyId, page, limit: 10 };
      if (roomTypeFilter !== 'all') params.roomTypeId = roomTypeFilter;
      return getRatePlans(params).then(res => res.data);
    },
    enabled: !!propertyId,
  });

  // Fetch Room Types for the filter dropdown
  const { data: roomTypesData } = useQuery({
    queryKey: ['roomTypesFilter', propertyId],
    queryFn: () => getRoomTypes({ propertyId, limit: 100 }).then(res => res.data.data),
    enabled: !!propertyId,
  });
  const roomTypes = roomTypesData || [];

  const ratePlans = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  // 2. Mutations
  const saveMutation = useMutation({
    mutationFn: (payload) => {
      const dataWithProperty = { ...payload, propertyId };
      return editingPlan ? updateRatePlan(editingPlan.ratePlanId, dataWithProperty) : createRatePlan(dataWithProperty);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ratePlans'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRatePlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ratePlans'] }),
  });

  const saveError = saveMutation.error?.response?.data?.message || (saveMutation.isError ? 'Failed to save rate plan.' : null);

  // 3. Handlers
  const openAddModal = () => { setEditingPlan(null); setIsModalOpen(true); };
  const openEditModal = (plan) => { setEditingPlan(plan); setIsModalOpen(true); };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlan(null);
    saveMutation.reset();
  };

  const handleSave = (formData) => saveMutation.mutate(formData);
  
  const handleDelete = (plan) => {
    // Protection: Check if plan is used in reservations
    if (plan._count?.reservationRooms > 0) {
      alert(`Cannot delete "${plan.planName}" because it is currently attached to ${plan._count.reservationRooms} reservation(s).`);
      return;
    }
    if (window.confirm(`Are you sure you want to deactivate the rate plan "${plan.planName}"?`)) {
      deleteMutation.mutate(plan.ratePlanId);
    }
  };

  // Client-side search filter
  const filteredPlans = ratePlans.filter(plan => 
    plan.planName?.toLowerCase().includes(search.toLowerCase()) ||
    plan.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Helper to get Room Type name
  const getRoomTypeName = (roomTypeId) => {
    const rt = roomTypes.find(r => r.roomTypeId === roomTypeId);
    return rt ? rt.typeName : 'Unknown Type';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Rate Plans</h1>
          <p className="text-text-muted text-sm mt-1">Manage pricing rules, discounts, and stay requirements.</p>
        </div>
        <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> Add Rate Plan
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-2 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input type="text" placeholder="Search rate plans..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
        </div>
        
        {/* Room Type Filter */}
        <div className="relative sm:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <select value={roomTypeFilter} onChange={(e) => { setRoomTypeFilter(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition appearance-none">
            <option value="all">All Room Types</option>
            {roomTypes.map(rt => (
              <option key={rt.roomTypeId} value={rt.roomTypeId}>{rt.typeName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-text-muted animate-pulse">Loading rate plans...</div>
        ) : error ? (
          <div className="p-12 text-center text-danger-600 flex flex-col items-center gap-2">
            <AlertCircle size={24} /> <p className="font-semibold">Failed to load rate plans</p>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
            <Tags size={24} /> <p className="font-semibold">No rate plans found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Plan Name</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Room Type</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Discount</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Stay Requirements</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Visibility</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => (
                  <tr key={plan.ratePlanId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-warning-50 text-warning-600 flex items-center justify-center">
                          <Tags size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{plan.planName}</p>
                          <p className="text-xs text-text-muted truncate max-w-xs">{plan.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-text">
                      {getRoomTypeName(plan.roomTypeId)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${parseFloat(plan.discountPercent) > 0 ? 'text-success-600' : 'text-text-muted'}`}>
                        {parseFloat(plan.discountPercent || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      {plan.minStay} - {plan.maxStay} nights
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${
                        plan.isPublic 
                          ? 'bg-success-50 text-success-700 ring-1 ring-success-600/20' 
                          : 'bg-secondary-100 text-secondary-600'
                      }`}>
                        {plan.isPublic ? 'Public' : 'Private'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(plan)} className="p-2 rounded-lg hover:bg-primary-50 text-primary-600 transition" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(plan)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Deactivate">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-3 border-t border-border bg-secondary-50/30 flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Showing <span className="font-semibold text-text">{filteredPlans.length}</span> of <span className="font-semibold text-text">{pagination.total}</span> plans
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-xs font-semibold text-text">Page {pagination.page} of {pagination.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <RatePlanModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleSave}
        isLoading={saveMutation.isPending}
        initialData={editingPlan}
        error={saveError}
      />
    </div>
  );
}