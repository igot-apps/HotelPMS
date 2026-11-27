import { Skeleton } from '../components/ui/Skeleton';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRooms, updateRoomStatus, getOnlineRoomAccess, setRoomOnlineBooking } from '../api/rooms';
import { MaintenanceReasonDialog } from '../components/rooms/MaintenanceReason';
import { useAuthStore } from '../store/authStore';
import RoomCard from '../components/rooms/RoomCard';
import RoomIssuesPanel from '../components/rooms/RoomIssuesPanel';
import { BedDouble, AlertCircle, CheckCircle2, Wrench, Sparkles, LayoutGrid, Search, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import RequirePermission from '../components/RequirePermission';
import { updateGuestPresence } from '../api/reservations';
import toast from 'react-hot-toast';

export default function RoomsPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [maintenanceRoom, setMaintenanceRoom] = useState(null);

  const { data: onlineAccess } = useQuery({
    queryKey: ['onlineRoomAccess', user?.userId],
    queryFn: () => getOnlineRoomAccess().then(res => res.data.data),
    enabled: !!propertyId,
  });
  const onlineMutation = useMutation({
    mutationFn: ({ roomId, enabled }) => setRoomOnlineBooking(roomId, enabled),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] });
      const room = response.data.data;
      toast.success(room.isOnlineBookable ? `Room ${room.roomNumber} can be booked online again.` : `Room ${room.roomNumber} is hidden from online booking.`);
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not change online booking for this room.'),
  });

  // 1. Fetch Rooms
  const { data: roomsData, isLoading, error } = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => getRooms(propertyId).then(res => res.data.data),
    enabled: !!propertyId,
  });

  console.log('Rooms Data:', roomsData); // Debugging line to check the fetched data

  // 2. Mutation
  const statusMutation = useMutation({
    mutationFn: ({ roomId, payload }) => updateRoomStatus(roomId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] });
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not update room status.'),
  });

  const guestPresenceMutation = useMutation({
    mutationFn: ({ reservationRoomId, action, expectedReturnAt }) =>
      updateGuestPresence(reservationRoomId, action, expectedReturnAt),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(variables.action === 'out' ? 'Guest marked as out.' : 'Guest marked as returned.');
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not update guest presence.'),
  });

  // 3. Handlers
  const handleToggleHousekeeping = (room) => {
    const newStatus = ['CLEAN', 'INSPECTED'].includes(room.housekeepingStatus?.toUpperCase()) ? 'Dirty' : 'Clean';
    statusMutation.mutate({ roomId: room.roomId, payload: { operationalStatus: room.operationalStatus, housekeepingStatus: newStatus } });
  };

  const handleToggleOperational = (room) => {
    // Entering maintenance asks for a reason first.
    if (room.operationalStatus?.toUpperCase() !== 'MAINTENANCE') { setMaintenanceRoom(room); return; }
    statusMutation.mutate({ roomId: room.roomId, payload: { operationalStatus: 'Available', housekeepingStatus: room.housekeepingStatus } });
  };

  const confirmMaintenance = (reason) => {
    statusMutation.mutate(
      { roomId: maintenanceRoom.roomId, payload: { operationalStatus: 'Maintenance', housekeepingStatus: maintenanceRoom.housekeepingStatus, maintenanceReason: reason } },
      { onSuccess: () => { setMaintenanceRoom(null); toast.success(`Room ${maintenanceRoom.roomNumber} set to maintenance.`); } },
    );
  };

  // 4. Data Processing
  const rooms = roomsData || [];
  const searchText = search.trim().toLowerCase();
  const matchesSearch = (room) => {
    if (!searchText) return true;
    const stay = room.reservationRooms?.[0];
    const res = stay?.reservation;
    return [room.roomNumber, room.roomType?.typeName, stay?.occupantName, stay?.occupantPhone, res?.guestNameSnapshot, res?.guestPhoneSnapshot, res?.confirmationCode, room.arrivingToday?.guestName, room.arrivingToday?.confirmationCode]
      .filter(Boolean).join(' ').toLowerCase().includes(searchText);
  };
  const filteredRooms = rooms.filter(room => {
    if (!matchesSearch(room)) return false;
    if (filter === 'all') return true;
    if (filter === 'ready') return room.operationalStatus === 'Available' && ['Clean', 'Inspected'].includes(room.housekeepingStatus) && !room.arrivingToday;
    if (filter === 'dirty') return room.housekeepingStatus?.toUpperCase() === 'DIRTY';
    return room.operationalStatus?.toUpperCase() === filter.toUpperCase();
  });

  const stats = {
    total: rooms.length,
    // Ready = clean, empty and not reserved for a guest arriving today.
    ready: rooms.filter(r => r.operationalStatus === 'Available' && ['Clean', 'Inspected'].includes(r.housekeepingStatus) && !r.arrivingToday).length,
    occupied: rooms.filter(r => r.operationalStatus?.toUpperCase() === 'OCCUPIED').length,
    dirty: rooms.filter(r => r.housekeepingStatus?.toUpperCase() === 'DIRTY').length,
  };

  // Tapping a stat box shows those rooms and brings the list into view (useful on phones).
  const showRooms = (id) => {
    setFilter(id);
    requestAnimationFrame(() => document.getElementById('room-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const filters = [
    { id: 'all', label: 'All Rooms', count: stats.total, icon: LayoutGrid },
    { id: 'ready', label: 'Ready', count: stats.ready, icon: CheckCircle2 },
    { id: 'OCCUPIED', label: 'Occupied', count: stats.occupied, icon: BedDouble },
    { id: 'MAINTENANCE', label: 'Maintenance', count: rooms.filter(r => r.operationalStatus?.toUpperCase() === 'MAINTENANCE').length, icon: Wrench },
    { id: 'dirty', label: 'Needs Cleaning', count: stats.dirty, icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-text tracking-tight">Room Inventory</h1>
          <p className="text-text-muted mt-1">Manage room status, housekeeping, and availability in real-time.</p>
        </div>
        <RequirePermission permission="CanCreateRoom">
          <Link to="/room-management" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"><Settings size={16} /> Edit rooms & prices</Link>
        </RequirePermission>
      </div>

      <RoomIssuesPanel />

      {/* Quick Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total Rooms" value={stats.total} color="secondary" active={filter === 'all'} onClick={() => showRooms('all')} />
        <StatBox label="Ready" value={stats.ready} color="success" active={filter === 'ready'} onClick={() => showRooms('ready')} />
        <StatBox label="Occupied" value={stats.occupied} color="primary" active={filter === 'OCCUPIED'} onClick={() => showRooms('OCCUPIED')} />
        <StatBox label="Needs Cleaning" value={stats.dirty} color="warning" active={filter === 'dirty'} onClick={() => showRooms('dirty')} />
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search room, guest, phone or booking code" aria-label="Search rooms" className="min-h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
      </div>

      {/* Modern Filter Bar */}
      <div id="room-filters" className="scroll-mt-4 bg-surface p-1.5 rounded-xl border border-border shadow-sm inline-flex flex-wrap gap-1.5">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              filter === f.id
                ? 'bg-primary-600 text-text-inverted shadow-md shadow-primary-600/20'
                : 'text-text-muted hover:bg-secondary-100 hover:text-text'
            }`}
          >
            <f.icon size={16} />
            {f.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-md ${
              filter === f.id ? 'bg-white/20' : 'bg-secondary-100 text-text-muted'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(8).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-danger-50 border border-danger-100 text-danger-600 p-6 rounded-2xl flex items-center gap-3">
          <AlertCircle size={24} /> 
          <div>
            <p className="font-bold">Failed to load rooms</p>
            <p className="text-sm opacity-80">Please check your connection and try again.</p>
          </div>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-16 text-center">
          <BedDouble className="mx-auto text-text-muted mb-4" size={48} />
          <h3 className="text-lg font-bold text-text">No rooms found</h3>
          <p className="text-text-muted mt-1">{searchText ? 'No room matches this search.' : 'Try adjusting your filters to see more rooms.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredRooms.map(room => (
            <RoomCard
              key={room.roomId}
              room={room}
              canCheckOut={Boolean(user?.permissions?.includes('CanCheckOutGuest'))}
              onToggleHousekeeping={handleToggleHousekeeping}
              onToggleOperational={handleToggleOperational}
              isUpdating={statusMutation.isPending}
              canManageOnline={Boolean(onlineAccess?.canManageOnlineRooms)}
              isOnlineUpdating={onlineMutation.isPending && onlineMutation.variables?.roomId === room.roomId}
              onToggleOnline={(target) => onlineMutation.mutate({ roomId: target.roomId, enabled: !target.isOnlineBookable })}
              isPresenceUpdating={guestPresenceMutation.isPending && guestPresenceMutation.variables?.reservationRoomId === room.reservationRooms?.[0]?.reservationRoomId}
              onSetGuestPresence={(reservationRoomId, action, expectedReturnAt) =>
                guestPresenceMutation.mutate({ reservationRoomId, action, expectedReturnAt })
              }
            />
          ))}
        </div>
      )}
      {maintenanceRoom && <MaintenanceReasonDialog room={maintenanceRoom} busy={statusMutation.isPending} onConfirm={confirmMaintenance} onClose={() => setMaintenanceRoom(null)} />}
    </div>
  );
}

// Reusable Mini Stat Box Component
function StatBox({ label, value, color, active, onClick }) {
  const colorMap = {
    secondary: 'bg-secondary-50 text-secondary-700',
    success: 'bg-success-50 text-success-700',
    primary: 'bg-primary-50 text-primary-700',
    warning: 'bg-warning-50 text-warning-700',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Show ${label.toLowerCase()}: ${value}`}
      className={`group w-full text-left bg-surface p-5 rounded-2xl border shadow-sm transition hover:border-primary-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-[0.98] ${active ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-border'}`}
    >
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between mt-2">
        <span className="text-3xl font-bold text-text">{value}</span>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${colorMap[color]}`}>
          {active ? 'Showing' : 'View'}
        </span>
      </div>
    </button>
  );
}
