import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRooms, updateRoomStatus } from '../api/rooms';
import { useAuthStore } from '../store/authStore';
import RoomCard from '../components/rooms/RoomCard';
import { BedDouble, AlertCircle, CheckCircle2, Wrench, Sparkles, LayoutGrid } from 'lucide-react';

export default function RoomsPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  
  const [filter, setFilter] = useState('all');

  // 1. Fetch Rooms
  const { data: roomsData, isLoading, error } = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => getRooms(propertyId).then(res => res.data.data),
    enabled: !!propertyId,
  });

  // 2. Mutation
  const statusMutation = useMutation({
    mutationFn: ({ roomId, payload }) => updateRoomStatus(roomId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] });
    },
  });

  // 3. Handlers
  const handleToggleHousekeeping = (room) => {
    const newStatus = room.housekeepingStatus?.toUpperCase() === 'CLEAN' ? 'Dirty' : 'Clean';
    statusMutation.mutate({ roomId: room.roomId, payload: { operationalStatus: room.operationalStatus, housekeepingStatus: newStatus } });
  };

  const handleToggleOperational = (room) => {
    const newStatus = room.operationalStatus?.toUpperCase() === 'MAINTENANCE' ? 'Available' : 'Maintenance';
    statusMutation.mutate({ roomId: room.roomId, payload: { operationalStatus: newStatus, housekeepingStatus: room.housekeepingStatus } });
  };

  // 4. Data Processing
  const rooms = roomsData || [];
  const filteredRooms = rooms.filter(room => {
    if (filter === 'all') return true;
    if (filter === 'dirty') return room.housekeepingStatus?.toUpperCase() === 'DIRTY';
    return room.operationalStatus?.toUpperCase() === filter.toUpperCase();
  });

  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.operationalStatus?.toUpperCase() === 'AVAILABLE').length,
    occupied: rooms.filter(r => r.operationalStatus?.toUpperCase() === 'OCCUPIED').length,
    dirty: rooms.filter(r => r.housekeepingStatus?.toUpperCase() === 'DIRTY').length,
  };

  const filters = [
    { id: 'all', label: 'All Rooms', count: stats.total, icon: LayoutGrid },
    { id: 'AVAILABLE', label: 'Available', count: stats.available, icon: CheckCircle2 },
    { id: 'OCCUPIED', label: 'Occupied', count: stats.occupied, icon: BedDouble },
    { id: 'MAINTENANCE', label: 'Maintenance', count: rooms.filter(r => r.operationalStatus?.toUpperCase() === 'MAINTENANCE').length, icon: Wrench },
    { id: 'dirty', label: 'Needs Cleaning', count: stats.dirty, icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-text tracking-tight">Room Inventory</h1>
        <p className="text-text-muted mt-1">Manage room status, housekeeping, and availability in real-time.</p>
      </div>

      {/* Quick Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox label="Total Rooms" value={stats.total} color="secondary" />
        <StatBox label="Available" value={stats.available} color="success" />
        <StatBox label="Occupied" value={stats.occupied} color="primary" />
        <StatBox label="Needs Cleaning" value={stats.dirty} color="warning" />
      </div>

      {/* Modern Filter Bar */}
      <div className="bg-surface p-1.5 rounded-xl border border-border shadow-sm inline-flex flex-wrap gap-1.5">
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
            <div key={i} className="h-64 bg-surface rounded-2xl border border-border animate-pulse"></div>
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
          <p className="text-text-muted mt-1">Try adjusting your filters to see more rooms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredRooms.map(room => (
            <RoomCard
              key={room.roomId}
              room={room}
              onToggleHousekeeping={handleToggleHousekeeping}
              onToggleOperational={handleToggleOperational}
              isUpdating={statusMutation.isLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Reusable Mini Stat Box Component
function StatBox({ label, value, color }) {
  const colorMap = {
    secondary: 'bg-secondary-50 text-secondary-700',
    success: 'bg-success-50 text-success-700',
    primary: 'bg-primary-50 text-primary-700',
    warning: 'bg-warning-50 text-warning-700',
  };

  return (
    <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between mt-2">
        <h3 className="text-3xl font-bold text-text">{value}</h3>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${colorMap[color]}`}>
          {label}
        </span>
      </div>
    </div>
  );
}