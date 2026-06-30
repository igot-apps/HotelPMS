import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGuests, createGuest, updateGuest, deleteGuest } from '../api/guests';
import GuestModal from '../components/guests/GuestModal';
import { Search, Plus, Edit2, Trash2, Users, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

export default function GuestsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['guests', page, debouncedSearch],
    queryFn: () => getGuests({ page, limit: 10, search: debouncedSearch }).then(res => res.data),
  });

  const guests = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  // 1. Save Mutation
  const saveMutation = useMutation({
    mutationFn: (payload) => editingGuest ? updateGuest(editingGuest.guestId, payload) : createGuest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      closeModal(); // Close modal on success
    },
  });

  // 2. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteGuest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guests'] }),
  });

  // Extract the exact error message from the backend (e.g., "Phone number already exists")
  const saveError = saveMutation.error?.response?.data?.message || (saveMutation.isError ? 'An unexpected error occurred.' : null);

  const openAddModal = () => { setEditingGuest(null); setIsModalOpen(true); };
  const openEditModal = (guest) => { setEditingGuest(guest); setIsModalOpen(true); };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGuest(null);
    saveMutation.reset(); // IMPORTANT: Clears the error state when closing the modal!
  };

  const handleSave = (formData) => saveMutation.mutate(formData);
  
  const handleDelete = (guest) => {
    if (window.confirm(`Are you sure you want to deactivate ${guest.fullName}?`)) {
      deleteMutation.mutate(guest.guestId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Guest Directory</h1>
          <p className="text-text-muted text-sm mt-1">Manage your hotel guests and their profiles.</p>
        </div>
        <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> Add New Guest
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-2 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input type="text" placeholder="Search by name, phone, or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-text-muted animate-pulse">Loading guests...</div>
        ) : error ? (
          <div className="p-12 text-center text-danger-600 flex flex-col items-center gap-2">
            <AlertCircle size={24} /> <p className="font-semibold">Failed to load guests</p>
          </div>
        ) : guests.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
            <Users size={24} /> <p className="font-semibold">No guests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Guest</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">ID / Location</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Stay History</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.guestId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                          {guest.fullName?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{guest.fullName}</p>
                          <p className="text-xs text-text-muted">Joined {new Date(guest.dateRegistered).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-text">{guest.phone}</p>
                      <p className="text-xs text-text-muted">{guest.email || 'No email'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      <p>{guest.idNumber || '-'}</p>
                      <p className="text-xs">{guest.city || '-'}, {guest.country || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-text">{guest.totalStays || 0} Stays</p>
                      <p className="text-xs text-text-muted">Last: {guest.lastStayDate ? new Date(guest.lastStayDate).toLocaleDateString() : 'Never'}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(guest)} className="p-2 rounded-lg hover:bg-primary-50 text-primary-600 transition" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(guest)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Deactivate">
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
              Showing <span className="font-semibold text-text">{guests.length}</span> of <span className="font-semibold text-text">{pagination.total}</span> guests
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

      {/* Modal (Now receiving the error prop) */}
      <GuestModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleSave}
        isLoading={saveMutation.isPending}
        initialData={editingGuest}
        error={saveError} // Passing the backend error message here!
      />
    </div>
  );
}