import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, CheckCircle2, Wrench, BedDouble, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getHousekeepingRooms, setCleaningStatus } from '../api/housekeeping';
import { useAuthStore } from '../store/authStore';

const tabs = [
  { id: 'needs', label: 'Needs cleaning', icon: Sparkles },
  { id: 'ready', label: 'Ready', icon: CheckCircle2 },
  { id: 'occupied', label: 'Occupied', icon: BedDouble },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
];

function group(room) {
  if (room.operationalStatus === 'Maintenance') return 'maintenance';
  if (room.operationalStatus === 'Occupied') return 'occupied';
  return room.housekeepingStatus === 'Dirty' ? 'needs' : 'ready';
}

export default function HousekeepingPage() {
  const [tab, setTab] = useState('needs');
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch, isFetching } = useQuery({ queryKey: ['housekeeping', user?.propertyId], queryFn: () => getHousekeepingRooms().then(result => result.data.data), enabled: Boolean(user?.propertyId && user?.housekeepingEnabled), refetchInterval: 30000 });
  const mutation = useMutation({ mutationFn: ({ roomId, status }) => setCleaningStatus(roomId, status), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['housekeeping', user?.propertyId] }); queryClient.invalidateQueries({ queryKey: ['rooms', user?.propertyId] }); toast.success('Room status updated.'); }, onError: err => toast.error(err.response?.data?.message || 'Could not update room.') });
  const rooms = data || [];
  const counts = Object.fromEntries(tabs.map(item => [item.id, rooms.filter(room => group(room) === item.id).length]));
  const visible = rooms.filter(room => group(room) === tab);

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-text sm:text-3xl">Housekeeping</h1><p className="mt-1 text-sm text-text-muted">Room readiness for {user?.propertyName || 'your property'}.</p></div><button type="button" onClick={() => refetch()} disabled={!user?.housekeepingEnabled || isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text disabled:opacity-50"><RefreshCw size={16} /> Refresh</button></div>
    {!user?.housekeepingEnabled ? <div className="rounded-xl border border-border bg-surface p-6"><h2 className="font-semibold text-text">Housekeeping is off</h2><p className="mt-2 text-sm text-text-muted">A manager can turn it on in Staff Management. Reception can still update room readiness in Rooms & Inventory.</p></div> : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tabs.map(item => <button type="button" key={item.id} onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`min-h-16 rounded-xl border p-3 text-left transition ${tab === item.id ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-border bg-surface text-text hover:border-primary-300'}`}><span className="flex items-center gap-2 text-sm font-semibold"><item.icon size={16} />{item.label}</span><span className="mt-1 block text-xl font-bold">{counts[item.id]}</span></button>)}</div>
      {error ? <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">Could not load rooms. Please refresh.</div> : isPending ? <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">Loading rooms…</div> : visible.length === 0 ? <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">No rooms in {tabs.find(item => item.id === tab)?.label.toLowerCase()}.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(room => <article key={room.roomId} className="rounded-xl border border-border bg-surface p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-text">Room {room.roomNumber}</h2><p className="mt-1 text-sm text-text-muted">{room.roomType?.typeName}{room.floor != null ? ` · Floor ${room.floor}` : ''}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tab === 'needs' ? 'bg-warning-50 text-warning-800' : tab === 'ready' ? 'bg-success-50 text-success-700' : 'bg-secondary-100 text-secondary-700'}`}>{tabs.find(item => item.id === tab)?.label}</span></div>{['needs', 'ready'].includes(tab) && <button type="button" onClick={() => mutation.mutate({ roomId: room.roomId, status: tab === 'needs' ? 'Clean' : 'Dirty' })} disabled={mutation.isPending} className={`mt-5 min-h-11 w-full rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${tab === 'needs' ? 'bg-primary-600 text-white hover:bg-primary-700' : 'border border-border text-text hover:bg-secondary-50'}`}>{tab === 'needs' ? 'Mark ready' : 'Mark needs cleaning'}</button>}</article>)}</div>}
    </>}
  </div>;
}
