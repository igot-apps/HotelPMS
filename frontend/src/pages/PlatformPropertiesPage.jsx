import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CreditCard, Edit2, MapPin, Plus, Power, Search, ShieldCheck, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import PropertyModal from '../components/catalog/PropertyModal';
import {
  createPlatformProperty,
  deactivatePlatformProperty,
  getPlatformProperties,
  updatePlatformProperty,
} from '../api/platformProperties';

export default function PlatformPropertiesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingProperty, setEditingProperty] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['platformProperties', page, search],
    queryFn: () => getPlatformProperties({ page, limit: 25, search }).then((response) => response.data),
  });
  const properties = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const stats = data?.stats || { total: 0, active: 0, trials: 0 };

  const saveMutation = useMutation({
    mutationFn: (formData) => editingProperty
      ? updatePlatformProperty(editingProperty.propertyId, formData)
      : createPlatformProperty(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platformProperties'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['publicDiscover'] });
      toast.success(editingProperty ? 'Property updated.' : 'Property created.');
      closeModal();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivatePlatformProperty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platformProperties'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      toast.success('Property deactivated. Its records have been retained.');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not deactivate property.'),
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProperty(null);
    saveMutation.reset();
  };

  const openAdd = () => {
    setEditingProperty(null);
    saveMutation.reset();
    setIsModalOpen(true);
  };

  const openEdit = (property) => {
    setEditingProperty(property);
    saveMutation.reset();
    setIsModalOpen(true);
  };

  const handleDeactivate = (property) => {
    const confirmed = window.confirm(
      `Deactivate ${property.propertyName}? Staff access and public booking will be disabled. Existing reservation and payment records will be retained.`
    );
    if (confirmed) deactivateMutation.mutate(property.propertyId);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
            <ShieldCheck size={14} /> Platform administration
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text">All properties</h1>
          <p className="mt-1 text-sm text-text-muted">Manage properties across the Stayfolio platform.</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-text-inverted shadow-sm transition hover:bg-primary-700">
          <Plus size={16} /> Add property
        </button>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Properties" value={stats.total} icon={Building2} />
        <SummaryCard label="Active" value={stats.active} icon={Users} />
        <SummaryCard label="On trial" value={stats.trials} icon={CreditCard} />
      </section>

      <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={17} />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search properties by name, code, or location"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-text outline-none transition placeholder:text-text-muted focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-text-muted">Loading platform properties…</div>
        ) : isError ? (
          <div className="p-12 text-center text-sm font-semibold text-danger-600">Could not load platform properties.</div>
        ) : properties.length === 0 ? (
          <div className="p-12 text-center text-sm text-text-muted">No matching properties.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="border-b border-border bg-secondary-50/50">
                <tr>
                  <TableHead>Property</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => {
                  const isActive = property.status === 'Active' && property.isActive;
                  return (
                    <tr key={property.propertyId} className="border-b border-border last:border-0 hover:bg-secondary-50/40">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Building2 size={19} /></span>
                          <span>
                            <span className="block text-sm font-semibold text-text">{property.propertyName}</span>
                            <span className="mt-0.5 block font-mono text-xs text-text-muted">{property.propertyCode} · {property.propertyType}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">
                        <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{[property.city, property.country].filter(Boolean).join(', ') || 'Location not set'}</span>
                        <span className="mt-1 block max-w-48 truncate text-xs">{property.address || 'No address'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="block text-sm font-semibold text-text">{property.subscriptionPlan || 'Starter'}</span>
                        <span className="text-xs text-text-muted">{property.subscriptionStatus || 'Unknown'}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">
                        <span className="font-semibold text-text">{property._count?.rooms || 0}</span> rooms
                        <span className="mx-2 text-border">·</span>
                        <span className="font-semibold text-text">{property._count?.users || 0}</span> staff
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? 'bg-success-50 text-success-700' : 'bg-secondary-100 text-secondary-600'}`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openEdit(property)} title="Edit property" className="rounded-lg p-2 text-primary-600 transition hover:bg-primary-50"><Edit2 size={16} /></button>
                          {isActive && (
                            <button onClick={() => handleDeactivate(property)} disabled={deactivateMutation.isPending} title="Deactivate property" className="rounded-lg p-2 text-danger-600 transition hover:bg-danger-50 disabled:opacity-50"><Power size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && pagination.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} properties</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page <= 1} className="rounded-lg border border-border px-3 py-1.5 font-medium text-text disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
              <button onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={pagination.page >= pagination.totalPages} className="rounded-lg border border-border px-3 py-1.5 font-medium text-text disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>

      <PropertyModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={(formData) => saveMutation.mutate(formData)}
        isLoading={saveMutation.isPending}
        initialData={editingProperty}
        error={saveMutation.error?.response?.data?.message || (saveMutation.isError ? 'Failed to save property.' : null)}
      />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Icon size={20} /></span>
      <span><span className="block text-sm text-text-muted">{label}</span><strong className="mt-0.5 block text-2xl text-text">{value}</strong></span>
    </div>
  );
}

function TableHead({ children, className = '' }) {
  return <th className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted ${className}`}>{children}</th>;
}
