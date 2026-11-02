import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Edit2, Trash2, Tag, Plus, Search } from 'lucide-react';
import { getAmenities, createAmenity, updateAmenity, deleteAmenity } from '../../api/amenities';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { amenitySuggestions } from '../../lib/amenity-presets.mjs';

const normalize = name => name.trim().replace(/\s+/g, ' ').toLowerCase();
const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50';

export default function AmenityManagementModal({ isOpen, onClose }) {
  const client = useQueryClient();
  const { user, permissions } = useAuthStore();
  const canCreate = permissions.includes('CanCreateRoomType');
  const canEdit = permissions.includes('CanUpdateRoomType');
  const canDelete = permissions.includes('CanDeleteRoomType');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState(null);
  const panel = useRef(null);
  const closeButton = useRef(null);
  const dismissRef = useRef(null);
  const key = ['amenities', user?.propertyId];
  const query = useQuery({ queryKey: key, queryFn: async () => (await getAmenities()).data.data, enabled: isOpen, retry: false });
  const amenities = query.data || [];
  const mutation = useMutation({
    mutationFn: async action => {
      if (action.type === 'create') return (await createAmenity({ name: action.name })).data;
      if (action.type === 'rename') return (await updateAmenity(action.id, { name: action.name })).data;
      return (await deleteAmenity(action.id, action.confirmedRoomTypeIds ? { confirmedRoomTypeIds: action.confirmedRoomTypeIds } : undefined)).data;
    },
    onSuccess: (result, action) => {
      toast.success(action.type === 'create' ? result.reused ? 'This amenity already exists in your library.' : 'Amenity added. Assign it in Room Types & Rates.' : action.type === 'rename' ? 'Amenity renamed across its room types.' : 'Amenity deleted.');
      if (action.type === 'create') setNewName('');
      setEditing(null); setDeleting(null);
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: ['roomTypes'] });
      client.invalidateQueries({ queryKey: ['publicRooms'] });
    },
    onError: error => { toast.error(error.response?.data?.message || 'Could not save changes. Please try again.'); client.invalidateQueries({ queryKey: key }); },
  });
  const busy = mutation.isPending;
  const dismiss = () => {
    if (busy) return;
    if ((newName.trim() || (editing && editName !== editing.name)) && !window.confirm('Discard your unsaved amenity changes?')) return;
    onClose();
  };
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); dismissRef.current?.(); }
      if (event.key === 'Tab') {
        const elements = [...(panel.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary') || [])];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [isOpen]);
  if (!isOpen) return null;
  const used = amenities.filter(a => a._count?.roomTypes > 0).length;
  const visible = amenities.filter(a => normalize(a.name).includes(normalize(search)) && (filter === 'all' || (filter === 'used' ? a._count?.roomTypes > 0 : !a._count?.roomTypes)));
  const suggestions = amenitySuggestions(amenities);
  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4">
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="amenity-title" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-6">
          <div><h2 id="amenity-title" className="flex items-center gap-2 text-xl font-bold text-text"><Tag size={21} className="shrink-0 text-primary-600" /> Amenity library</h2><p className="mt-1 text-sm text-text-muted">Create reusable room amenities, then assign them in Room Types & Rates.</p></div>
          <button ref={closeButton} type="button" disabled={busy} onClick={dismiss} className={`${buttonClass} shrink-0`} aria-label="Close amenity library"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-busy={busy || query.isFetching}>
          {query.isPending ? <p role="status" className="flex items-center justify-center gap-2 py-10 text-text-muted"><Loader2 className="animate-spin" size={20} /> Loading amenities…</p> : query.isError ? <div role="alert" className="rounded-xl border border-danger-200 p-4"><p>Could not load amenities. Your existing amenities have not been changed.</p><button type="button" onClick={() => query.refetch()} className={`${buttonClass} mt-3`}>Try again</button></div> : <>
            <div className="grid grid-cols-3 gap-2">{[['Total', amenities.length], ['In use', used], ['Unused', amenities.length - used]].map(([label, count]) => <div key={label} className="rounded-xl border border-border bg-background p-3"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-xl font-bold text-text">{count}</p></div>)}</div>
            {canCreate && <div className="space-y-3 rounded-xl border border-primary-100 bg-primary-50 p-4">
              <form onSubmit={event => { event.preventDefault(); if (newName.trim()) mutation.mutate({ type: 'create', name: newName }); }}>
                <label htmlFor="new-amenity" className="mb-2 block text-sm font-semibold text-text">Add an amenity</label>
                <div className="flex flex-col gap-2 sm:flex-row"><input id="new-amenity" value={newName} disabled={busy} onChange={e => setNewName(e.target.value)} maxLength={100} required placeholder="e.g. Air conditioning" className={inputClass} /><button disabled={busy || !newName.trim()} className={`${buttonClass} shrink-0 border-primary-600 bg-primary-600 text-white`}><Plus size={18} /> Add amenity</button></div>
              </form>
              {suggestions.length > 0 && <div><p className="mb-2 text-xs font-semibold text-text-muted">Quick add · choose only what your rooms offer</p><div className="flex flex-wrap gap-2">{suggestions.map(name => <button key={name} type="button" disabled={busy} onClick={() => mutation.mutate({ type: 'create', name })} className="min-h-10 rounded-full border border-primary-200 bg-surface px-3 py-2 text-xs font-semibold text-primary-700 disabled:opacity-50">+ {name}</button>)}</div></div>}
            </div>}
            <div className="flex flex-col gap-3 sm:flex-row"><label className="relative min-w-0 flex-1"><span className="sr-only">Search amenities</span><Search size={17} className="absolute left-3 top-3 text-text-muted" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search amenities…" className={`${inputClass} pl-10`} /></label><label><span className="sr-only">Filter by usage</span><select value={filter} onChange={e => setFilter(e.target.value)} className={inputClass}><option value="all">All amenities</option><option value="used">Used by room types</option><option value="unused">Unused amenities</option></select></label></div>
            <p className="text-xs text-text-muted">Renaming updates every assigned room type. Deleting an assigned amenity requires confirmation to remove it from those room types.</p>
            {visible.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">{amenities.length ? 'No amenities match your search or filter.' : 'Your library is empty. Add an amenity above to get started.'}</p> : <ul className="space-y-3">{visible.map(amenity => {
              const count = amenity._count?.roomTypes || 0;
              return <li key={amenity.amenityId} className="min-w-0 rounded-xl border border-border bg-background p-4">
                {editing?.amenityId === amenity.amenityId ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); mutation.mutate({ type: 'rename', id: amenity.amenityId, name: editName }); }}>
                  <label className="block text-sm font-semibold">Rename amenity<input autoFocus value={editName} maxLength={100} required disabled={busy} onChange={e => setEditName(e.target.value)} className={`${inputClass} mt-2`} /></label>
                  {count > 0 && <p className="text-xs text-warning-700">This name will change on {count} assigned room type(s).</p>}
                  <div className="flex flex-wrap gap-2"><button disabled={busy || !editName.trim()} className={`${buttonClass} bg-primary-600 text-white`}>Save name</button><button type="button" disabled={busy} onClick={() => setEditing(null)} className={buttonClass}>Cancel</button></div>
                </form> : <>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><p className="break-words font-semibold text-text">{amenity.name}</p><p className={`mt-1 text-xs ${count ? 'text-primary-700' : 'text-text-muted'}`}>{count ? `Used by ${count} room type(s)` : 'Not assigned to any room type'}</p></div><div className="flex shrink-0 gap-2">{canEdit && <button type="button" disabled={busy} onClick={() => { setDeleting(null); setEditing(amenity); setEditName(amenity.name); }} className={buttonClass}><Edit2 size={16} /> Rename</button>}{canDelete && <button type="button" disabled={busy || (count > 0 && !canEdit)} title={count > 0 && !canEdit ? 'Room-type editing permission is required to remove assignments' : 'Review and delete amenity'} onClick={() => { setEditing(null); setDeleting(amenity.amenityId); }} className={`${buttonClass} text-danger-700`} aria-label={`Delete ${amenity.name}`}><Trash2 size={16} /></button>}</div></div>
                  {count > 0 && <details className="mt-3 text-sm"><summary className="min-h-10 cursor-pointer py-2 font-semibold text-text-muted">View room types</summary><div className="flex flex-wrap gap-2 pt-2">{amenity.roomTypes?.map(link => <span key={link.roomType.roomTypeId} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text">{link.roomType.typeName}</span>)}</div></details>}
                </>}
                {deleting === amenity.amenityId && <div role="alert" className="mt-3 rounded-lg border border-danger-200 bg-danger-50 p-3"><p className="text-sm text-danger-700">Delete “{amenity.name}” from this hotel's library? This cannot be undone.</p>{count > 0 && <div className="mt-2 text-sm text-danger-700"><p>It will also be removed from these room types:</p><ul className="mt-1 list-inside list-disc">{amenity.roomTypes?.map(link => <li key={link.roomType.roomTypeId}>{link.roomType.typeName}</li>)}</ul></div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => mutation.mutate({ type: 'delete', id: amenity.amenityId, ...(count > 0 ? { confirmedRoomTypeIds: amenity.roomTypes?.map(link => link.roomType.roomTypeId) } : {}) })} className={`${buttonClass} bg-danger-600 text-white`}>{count > 0 ? 'Remove from room types & delete' : 'Delete amenity'}</button><button type="button" disabled={busy} onClick={() => setDeleting(null)} className={buttonClass}>Keep amenity</button></div></div>}
              </li>;
            })}</ul>}
          </>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-border p-4"><p role="status" className="text-xs text-text-muted">{busy ? 'Saving changes…' : 'Amenities are shared within your hotel only.'}</p><button type="button" disabled={busy} onClick={dismiss} className={buttonClass}>Done</button></footer>
      </section>
    </div>
  );
}
