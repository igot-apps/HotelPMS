import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProperties, createProperty, updateProperty, deleteProperty } from '../api/properties';
import { useAuthStore } from '../store/authStore';
import PropertyModal from '../components/catalog/PropertyModal';
import { Search, Plus, Edit2, Trash2, Building2, AlertCircle, MapPin, Clock } from 'lucide-react';

export default function PropertiesPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [search, setSearch] = useState('');

  // 1. Fetch Properties
  const { data, isLoading, error } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties({ limit: 50 }).then(res => res.data),
  });

  const properties = data?.data || [];

  // 2. Mutations
  const saveMutation = useMutation({
    mutationFn: (payload) => {
      // Backend requires tenantId for creation, we inject it from the logged-in user
      const payloadWithTenant = { ...payload, tenantId: user.tenantId };
      return editingProperty ? updateProperty(editingProperty.propertyId, payload) : createProperty(payloadWithTenant);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProperty(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['properties'] }),
  });

  const saveError = saveMutation.error?.response?.data?.message || (saveMutation.isError ? 'Failed to save property.' : null);

  // 3. Handlers
  const openAddModal = () => { setEditingProperty(null); setIsModalOpen(true); };
  const openEditModal = (prop) => { setEditingProperty(prop); setIsModalOpen(true); };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProperty(null);
    saveMutation.reset();
  };

  const handleSave = (formData) => saveMutation.mutate(formData);
  
  const handleDelete = (prop) => {
    if (prop._count?.rooms > 0 || prop._count?.reservations > 0) {
      alert(`Cannot delete "${prop.propertyName}" because it has active rooms or reservations.`);
      return;
    }
    if (window.confirm(`Are you sure you want to deactivate "${prop.propertyName}"?`)) {
      deleteMutation.mutate(prop.propertyId);
    }
  };

  // Client-side search
  const filteredProperties = properties.filter(prop => 
    prop.propertyName?.toLowerCase().includes(search.toLowerCase()) ||
    prop.propertyCode?.toLowerCase().includes(search.toLowerCase()) ||
    prop.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Properties</h1>
          <p className="text-text-muted text-sm mt-1">Manage your hotel locations and branch settings.</p>
        </div>
        <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input type="text" placeholder="Search by name, code, or city..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-text-muted animate-pulse">Loading properties...</div>
        ) : error ? (
          <div className="p-12 text-center text-danger-600 flex flex-col items-center gap-2">
            <AlertCircle size={24} /> <p className="font-semibold">Failed to load properties</p>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
            <Building2 size={24} /> <p className="font-semibold">No properties found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Property</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Capacity & Stats</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Policies</th>
                  <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map((prop) => (
                  <tr key={prop.propertyId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text">{prop.propertyName}</p>
                          <p className="text-xs text-text-muted font-mono">{prop.propertyCode} • {prop.propertyType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-text-muted">
                        <MapPin size={14} className="text-text-muted" />
                        <span>{prop.city || '-'}, {prop.country || '-'}</span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 truncate max-w-[150px]">{prop.address || 'No address'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-4 text-sm">
                        <div>
                          <p className="font-bold text-text">{prop._count?.rooms || 0}</p>
                          <p className="text-xs text-text-muted">Rooms</p>
                        </div>
                        <div>
                          <p className="font-bold text-text">{prop._count?.reservations || 0}</p>
                          <p className="text-xs text-text-muted">Bookings</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-text-muted">
                        <Clock size={14} className="text-text-muted" />
                        <span>In: {prop.checkInTime || '14:00'} | Out: {prop.checkOutTime || '11:00'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditModal(prop)} className="p-2 rounded-lg hover:bg-primary-50 text-primary-600 transition" title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(prop)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Deactivate">
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
      </div>

      {/* Modal */}
      <PropertyModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleSave}
        isLoading={saveMutation.isPending}
        initialData={editingProperty}
        error={saveError}
      />
    </div>
  );
}