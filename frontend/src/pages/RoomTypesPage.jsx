import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoomTypes, createRoomType, updateRoomType, deleteRoomType } from '../api/roomTypes';
import { useAuthStore } from '../store/authStore';
import RoomTypeModal from '../components/catalog/RoomTypeModal';
import { Search, Plus, Edit2, Trash2, Layers, AlertCircle, ChevronLeft, ChevronRight, BedDouble } from 'lucide-react';

export default function RoomTypesPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // 1. Fetch Room Types
  const { data, isLoading, error } = useQuery({
    queryKey: ['roomTypes', propertyId, page],
    queryFn: () => getRoomTypes({ propertyId, page, limit: 10 }).then(res => res.data),
    enabled: !!propertyId,
  });

  const roomTypes = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  // 2. Mutations
  const saveMutation = useMutation({
    mutationFn: (payload) => {
      const dataWithProperty = { ...payload, propertyId };
      return editingType ? updateRoomType(editingType.roomTypeId, dataWithProperty) : createRoomType(dataWithProperty);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roomTypes'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteRoomType(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roomTypes'] }),
  });

  // Extract error for modal
  const saveError = saveMutation.error?.response?.data?.message || (saveMutation.isError ? 'Failed to save room type.' : null);

  // 3. Handlers
  const openAddModal = () => { setEditingType(null); setIsModalOpen(true); };
  const openEditModal = (type) => { setEditingType(type); setIsModalOpen(true); };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingType(null);
    saveMutation.reset();
  };

  const handleSave = (formData) => saveMutation.mutate(formData);
  
  const handleDelete = (type) => {
    if (type._count?.rooms > 0) {
      alert(`Cannot delete "${type.typeName}" because it is currently assigned to ${type._count.rooms} room(s). Please reassign those rooms first.`);
      return;
    }
    if (window.confirm(`Are you sure you want to deactivate the room type "${type.typeName}"?`)) {
      deleteMutation.mutate(type.roomTypeId);
    }
  };

  // Client-side search filter
  const filteredTypes = roomTypes.filter(type => 
    type.typeName?.toLowerCase().includes(search.toLowerCase()) ||
    type.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Room Types</h1>
          <p className="text-text-muted text-sm mt-1">Manage room categories, base pricing, and occupancy limits.</p>
        </div>
        <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> Add Room Type
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-2 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input type="text" placeholder="Search room types..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-text-muted animate-pulse">Loading room types...</div>
        ) : error ? (
          <div className="p-12 text-center text-danger-600 flex flex-col items-center gap-2">
            <AlertCircle size={24} /> <p className="font-semibold">Failed to load room types</p>
          </div>
        ) : filteredTypes.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
            <Layers size={24} /> <p className="font-semibold">No room types found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Room Type</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Base Price</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Max Occupancy</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Assigned Rooms</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTypes.map((type) => (
                  <tr key={type.roomTypeId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                          <BedDouble size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{type.typeName}</p>
                          <p className="text-xs text-text-muted truncate max-w-xs">{type.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-text">
                      {parseFloat(type.basePrice || 0).toFixed(2)} GHS
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      {type.maxOccupancy} Guests
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-semibold ${type._count?.rooms > 0 ? 'text-text' : 'text-text-muted'}`}>
                        {type._count?.rooms || 0} Rooms
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(type)} className="p-2 rounded-lg hover:bg-primary-50 text-primary-600 transition" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(type)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Deactivate">
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
              Showing <span className="font-semibold text-text">{filteredTypes.length}</span> of <span className="font-semibold text-text">{pagination.total}</span> types
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
      <RoomTypeModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleSave}
        isLoading={saveMutation.isPending}
        initialData={editingType}
        error={saveError}
      />
    </div>
  );
}