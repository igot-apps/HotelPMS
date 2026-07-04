// src/pages/RoomsPage.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getRooms, getRoomTypes, createRoom, updateRoom, deleteRoom, 
  createRoomType, updateRoomType, deleteRoomType, updateRoomStatus 
} from '../api/rooms'; // Ensure these are exported from your api file
import RequirePermission from '../components/RequirePermission';
import { 
  BedDouble, Layers, Plus, Edit2, Trash2, AlertCircle, Loader2, 
  Sparkles, CheckCircle2, X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function RoomsPage() {
  const [activeTab, setActiveTab] = useState('rooms');
  const queryClient = useQueryClient();

  // ==========================================
  // 1. DATA FETCHING
  // ==========================================
  const { data: roomsData, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => getRooms({ limit: 100 }).then(res => res.data.data),
  });

  const { data: typesData, isLoading: isLoadingTypes } = useQuery({
    queryKey: ['roomTypes'],
    queryFn: () => getRoomTypes({ limit: 100 }).then(res => res.data.data),
  });

  const rooms = roomsData || [];
  const roomTypes = typesData || [];

  // ==========================================
  // 2. MUTATIONS
  // ==========================================
  const statusMutation = useMutation({
    mutationFn: ({ id, data }) => updateRoomStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room status updated!');
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id) => deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room deleted.');
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id) => deleteRoomType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roomTypes'] });
      toast.success('Room type deleted.');
    },
  });

  const handleStatusChange = (roomId, operationalStatus, housekeepingStatus) => {
    statusMutation.mutate({ id: roomId, data: { operationalStatus, housekeepingStatus } });
  };

  const handleDeleteRoom = (id, roomNumber) => {
    if (window.confirm(`Are you sure you want to delete Room ${roomNumber}? This cannot be undone.`)) {
      deleteRoomMutation.mutate(id);
    }
  };

  const handleDeleteType = (id, typeName) => {
    if (window.confirm(`Delete "${typeName}"? Ensure no rooms are currently using this type.`)) {
      deleteTypeMutation.mutate(id);
    }
  };

  // ==========================================
  // 3. UI RENDERING
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Room Inventory</h1>
          <p className="text-text-muted text-sm mt-1">Manage physical rooms, categories, and housekeeping status.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          <button 
            onClick={() => setActiveTab('rooms')} 
            className={`pb-3 text-sm font-semibold border-b-2 transition ${activeTab === 'rooms' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text'}`}
          >
            <BedDouble size={16} className="inline mr-2" /> Physical Rooms ({rooms.length})
          </button>
          <button 
            onClick={() => setActiveTab('types')} 
            className={`pb-3 text-sm font-semibold border-b-2 transition ${activeTab === 'types' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text'}`}
          >
            <Layers size={16} className="inline mr-2" /> Room Types & Rates ({roomTypes.length})
          </button>
        </nav>
      </div>

      {/* ========================================== */}
      {/* TAB 1: PHYSICAL ROOMS                      */}
      {/* ========================================== */}
      {activeTab === 'rooms' && (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-secondary-50/30">
            <h3 className="text-sm font-bold text-text">Room Status & Housekeeping</h3>
            
            {/* ONLY MANAGERS CAN CREATE ROOMS */}
            <RequirePermission permission="CanCreateRoom">
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
                <Plus size={16} /> Add New Room
              </button>
            </RequirePermission>
          </div>

          {isLoadingRooms ? (
            <div className="p-12 text-center text-text-muted animate-pulse">Loading rooms...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary-50/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Room</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Type / Floor</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Operational</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Housekeeping</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.roomId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition">
                      <td className="px-6 py-4">
                        <p className="text-lg font-bold text-text">{room.roomNumber}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-text">{room.roomType?.typeName}</p>
                        <p className="text-xs text-text-muted">Floor {room.floor}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          room.operationalStatus === 'Available' ? 'bg-success-50 text-success-700' : 
                          room.operationalStatus === 'Maintenance' ? 'bg-warning-50 text-warning-700' : 
                          'bg-secondary-100 text-secondary-700'
                        }`}>
                          {room.operationalStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          room.housekeepingStatus === 'Clean' ? 'bg-primary-50 text-primary-700' : 
                          room.housekeepingStatus === 'Dirty' ? 'bg-danger-50 text-danger-700' : 
                          'bg-secondary-100 text-secondary-700'
                        }`}>
                          {room.housekeepingStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          
                          {/* HOUSEKEEPING ACTIONS (Visible to Housekeeping & Managers) */}
                          <RequirePermission permission="CanUpdateRoomStatus">
                            {room.housekeepingStatus === 'Dirty' ? (
                              <button 
                                onClick={() => handleStatusChange(room.roomId, room.operationalStatus, 'Clean')}
                                className="p-2 rounded-lg bg-success-50 text-success-600 hover:bg-success-100 transition" 
                                title="Mark as Clean"
                              >
                                <Sparkles size={16} />
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleStatusChange(room.roomId, room.operationalStatus, 'Dirty')}
                                className="p-2 rounded-lg bg-secondary-100 text-text-muted hover:bg-secondary-200 transition" 
                                title="Mark as Dirty"
                              >
                                <AlertCircle size={16} />
                              </button>
                            )}
                          </RequirePermission>

                          {/* MANAGER ACTIONS (Edit / Delete) */}
                          <RequirePermission permission="CanUpdateRoom">
                            <button className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="Edit Room">
                              <Edit2 size={16} />
                            </button>
                          </RequirePermission>
                          
                          <RequirePermission permission="CanDeleteRoom">
                            <button 
                              onClick={() => handleDeleteRoom(room.roomId, room.roomNumber)}
                              className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" 
                              title="Delete Room"
                            >
                              <Trash2 size={16} />
                            </button>
                          </RequirePermission>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* TAB 2: ROOM TYPES & RATES                  */}
      {/* ========================================== */}
      {activeTab === 'types' && (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex justify-between items-center bg-secondary-50/30">
            <h3 className="text-sm font-bold text-text">Categories & Base Pricing</h3>
            
            {/* ONLY MANAGERS CAN CREATE ROOM TYPES */}
            <RequirePermission permission="CanCreateRoomType">
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
                <Plus size={16} /> Add Room Type
              </button>
            </RequirePermission>
          </div>

          {isLoadingTypes ? (
            <div className="p-12 text-center text-text-muted animate-pulse">Loading room types...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary-50/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Type Name</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Description</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Max Guests</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase text-right">Base Price</th>
                    <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roomTypes.map((type) => (
                    <tr key={type.roomTypeId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-text">{type.typeName}</p>
                        <p className="text-xs text-text-muted">{type._count?.rooms || 0} Rooms assigned</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-muted max-w-xs truncate">{type.description || '-'}</td>
                      <td className="px-6 py-4 text-sm text-text">{type.maxOccupancy} Guests</td>
                      <td className="px-6 py-4 text-sm font-bold text-primary-600 text-right">
                        GH₵ {parseFloat(type.basePrice || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <RequirePermission permission="CanUpdateRoomType">
                            <button className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="Edit Type">
                              <Edit2 size={16} />
                            </button>
                          </RequirePermission>
                          
                          <RequirePermission permission="CanDeleteRoomType">
                            <button 
                              onClick={() => handleDeleteType(type.roomTypeId, type.typeName)}
                              className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" 
                              title="Delete Type"
                            >
                              <Trash2 size={16} />
                            </button>
                          </RequirePermission>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}