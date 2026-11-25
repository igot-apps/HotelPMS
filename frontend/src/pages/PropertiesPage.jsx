import { SkeletonRows } from '../components/ui/Skeleton';
import ResponsiveTable from '../components/ui/ResponsiveTable';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProperties, updateProperty } from '../api/properties';
import PropertyModal from '../components/catalog/PropertyModal';
import { Search, Edit2, Building2, AlertCircle, MapPin, Clock, Plus, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import AddPropertyDialog from '../components/layout/AddPropertyDialog';
import { openProperty } from '../components/layout/PropertySwitcher';

export default function PropertiesPage() {
  // ✅ REMOVED: const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [search, setSearch] = useState('');
  const user = useAuthStore((state) => state.user);
  const myProperties = user?.properties || [];
  const showMine = myProperties.length > 1 || user?.canAddProperty;
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState(null);
  const open = (propertyId, path) => { setOpening(propertyId); openProperty(propertyId, queryClient, path).catch(() => setOpening(null)); };

  // 1. Fetch Properties
  const { data, isLoading, error } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties({ limit: 50 }).then(res => res.data),
  });

  const properties = data?.data || [];

  // 2. Mutations
  const saveMutation = useMutation({
    mutationFn: (payload) => {
      // ✅ FIXED: Backend no longer requires tenantId. Property is the root entity.
      // We just send the payload directly!
      return updateProperty(editingProperty.propertyId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['publicDiscover'] });
      closeModal();
    },
  });

  const saveError = saveMutation.error?.response?.data?.message || (saveMutation.isError ? 'Failed to save property.' : null);

  // 3. Handlers
  const openEditModal = (prop) => { setEditingProperty(prop); setIsModalOpen(true); };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProperty(null);
    saveMutation.reset();
  };

  const handleSave = (formData) => saveMutation.mutate(formData);

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
          <h1 className="text-2xl font-bold text-text tracking-tight">Property settings</h1>
          <p className="text-text-muted text-sm mt-1">Manage the details and settings for your property.</p>
        </div>
        {user?.canAddProperty && (
          <button type="button" onClick={() => setAdding(true)} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-text-inverted hover:bg-primary-700">
            <Plus size={16} /> Add property
          </button>
        )}
      </div>

      {/* Owners: every property on this account, one click to open another. */}
      {showMine && (
        <section aria-labelledby="my-properties" className="bg-surface border border-border rounded-xl p-4">
          <h2 id="my-properties" className="text-sm font-bold text-text">Your properties ({myProperties.length})</h2>
          <p className="text-xs text-text-muted mt-0.5">Each property has its own rooms, staff, money and plan. You are working in the one marked Current.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {myProperties.map((p) => {
              const current = p.propertyId === user.propertyId;
              return (
                <li key={p.propertyId} className={`flex items-center gap-3 rounded-lg border p-3 ${current ? 'border-primary-500 bg-primary-50' : 'border-border'}`}>
                  <Building2 size={18} className="shrink-0 text-primary-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text">{p.propertyName}</span>
                    <span className="block truncate text-xs text-text-muted">{[p.city, !p.isActive ? 'Deactivated' : p.expired ? 'Subscription ended' : 'Active'].filter(Boolean).join(' · ')}</span>
                  </span>
                  {current ? (
                    <span className="shrink-0 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-text-inverted">Current</span>
                  ) : (
                    <button type="button" disabled={opening !== null} onClick={() => open(p.propertyId)} className="shrink-0 min-h-11 inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-primary-700 hover:border-primary-500 disabled:opacity-60">
                      {opening === p.propertyId ? <Loader2 size={14} className="animate-spin" /> : <>Open <ArrowRight size={14} /></>}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {adding && <AddPropertyDialog onClose={() => setAdding(false)} onAdded={(property) => open(property.propertyId, '/billing')} />}

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
          <input 
            type="text" 
            placeholder="Search by name, code, or city..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <SkeletonRows rows={3} label="Loading properties…" />
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
            <ResponsiveTable className="w-full text-left">
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
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
