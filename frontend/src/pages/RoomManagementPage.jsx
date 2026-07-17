import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  getRooms, createRoom, updateRoom, deleteRoom, updateRoomStatus,
  getRoomTypes 
} from '../api/rooms';
import RequirePermission from '../components/RequirePermission';
import RoomTypeModal from '../components/catalog/RoomTypeModal'; 
import AmenityManagementModal from '../components/catalog/AmenityManagementModal'; // 🌟 NEW IMPORT
import toast from 'react-hot-toast';
import {
  BedDouble, Layers, Plus, Edit2, Trash2, Loader2, Sparkles, AlertCircle, X, Users, Tag // 🌟 Added Tag icon
} from 'lucide-react';

export default function RoomManagementPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('rooms');
  
  // Modal States
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isAmenityModalOpen, setIsAmenityModalOpen] = useState(false); // 🌟 NEW STATE
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingType, setEditingType] = useState(null);

  // Queries
  const { data: roomsData, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => getRooms({ limit: 100 }).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const { data: typesData, isLoading: isLoadingTypes } = useQuery({
    queryKey: ['roomTypes'],
    queryFn: () => getRoomTypes({ limit: 100 }).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const rooms = roomsData || [];
  const roomTypes = typesData || [];

  // Room Mutations
  const roomMutation = useMutation({
    mutationFn: ({ id, data }) => id ? updateRoom(id, data) : createRoom(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(editingRoom ? 'Room updated!' : 'Room created!');
      setIsRoomModalOpen(false);
      setEditingRoom(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save room'),
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (id) => deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room deactivated.');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, data }) => updateRoomStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room status updated!');
    },
  });

  // Handlers
  const handleSaveRoom = (data) => {
    if (editingRoom) {
      roomMutation.mutate({ id: editingRoom.roomId, data });
    } else {
      roomMutation.mutate({ data });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Room Management</h1>
        <p className="text-text-muted text-sm mt-1">Configure physical rooms, categories, base pricing, and amenities.</p>
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

      {/* Tab Content */}
      {activeTab === 'rooms' && (
        <RoomsTab 
          rooms={rooms} 
          isLoading={isLoadingRooms}
          onAdd={() => { setEditingRoom(null); setIsRoomModalOpen(true); }}
          onEdit={(room) => { setEditingRoom(room); setIsRoomModalOpen(true); }}
          onDelete={(id, num) => window.confirm(`Deactivate Room ${num}?`) && deleteRoomMutation.mutate(id)}
          onStatusChange={(id, op, hk) => statusMutation.mutate({ id, data: { operationalStatus: op, housekeepingStatus: hk } })}
        />
      )}
      
      {activeTab === 'types' && (
        <TypesTab 
          types={roomTypes} 
          isLoading={isLoadingTypes}
          onAdd={() => { setEditingType(null); setIsTypeModalOpen(true); }}
          onEdit={(type) => { setEditingType(type); setIsTypeModalOpen(true); }}
          onDelete={(id, name) => window.confirm(`Delete "${name}"? Ensure no rooms are using it.`) && deleteRoomType(id)} // Note: You'll need to ensure deleteRoomType is imported or handled if used here, or remove this prop if not needed.
          onManageAmenities={() => setIsAmenityModalOpen(true)} // 🌟 NEW PROP
        />
      )}

      {/* Modals */}
      {isRoomModalOpen && (
        <RoomModal 
          room={editingRoom} 
          roomTypes={roomTypes} 
          propertyId={propertyId}
          onClose={() => { setIsRoomModalOpen(false); setEditingRoom(null); }}
          onSave={handleSaveRoom} 
          isLoading={roomMutation.isPending}
        />
      )}

      {/* 🌟 ADVANCED ROOM TYPE MODAL */}
      {isTypeModalOpen && (
        <RoomTypeModal 
          isOpen={isTypeModalOpen}
          initialData={editingType}
          onClose={() => { setIsTypeModalOpen(false); setEditingType(null); }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['roomTypes'] });
            toast.success(editingType ? 'Room type updated!' : 'Room type created!');
          }}
        />
      )}

      {/* 🌟 AMENITY MANAGEMENT MODAL */}
      {isAmenityModalOpen && (
        <AmenityManagementModal 
          isOpen={isAmenityModalOpen} 
          onClose={() => {
            setIsAmenityModalOpen(false);
            // 🌟 THE MAGIC FIX: Force the parent page to refetch Room Types
            queryClient.invalidateQueries({ queryKey: ['roomTypes'] }); 
          }} 
        />
      )}
    </div>
  );
}

// ==========================================
// Sub-Components
// ==========================================

function RoomsTab({ rooms, isLoading, onAdd, onEdit, onDelete, onStatusChange }) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-secondary-50/30">
        <h3 className="text-sm font-bold text-text">Physical Rooms</h3>
        <RequirePermission permission="CanCreateRoom">
          <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
            <Plus size={16} /> Add New Room
          </button>
        </RequirePermission>
      </div>
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
            {isLoading ? (
              <tr> <td colSpan="5" className="p-12 text-center text-text-muted animate-pulse">Loading rooms...</td> </tr>
            ) : rooms.length === 0 ? (
              <tr> <td colSpan="5" className="p-12 text-center text-text-muted">No rooms found. Click "Add New Room" to create one.</td> </tr>
            ) : (
              rooms.map((room) => (
                <tr key={room.roomId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition">
                  <td className="px-6 py-4"> <p className="text-lg font-bold text-text">{room.roomNumber}</p> </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-text">{room.roomType?.typeName}</p>
                    <p className="text-xs text-text-muted">Floor {room.floor}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${room.operationalStatus === 'Available' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
                      {room.operationalStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${room.housekeepingStatus === 'Clean' ? 'bg-primary-50 text-primary-700' : 'bg-danger-50 text-danger-700'}`}>
                      {room.housekeepingStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <RequirePermission permission="CanUpdateRoomStatus">
                        <button onClick={() => onStatusChange(room.roomId, room.operationalStatus, room.housekeepingStatus === 'Clean' ? 'Dirty' : 'Clean')} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="Toggle Clean/Dirty">
                          <Sparkles size={16} />
                        </button>
                      </RequirePermission>
                      <RequirePermission permission="CanUpdateRoom">
                        <button onClick={() => onEdit(room)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="Edit Room"> <Edit2 size={16} /> </button>
                      </RequirePermission>
                      <RequirePermission permission="CanDeleteRoom">
                        <button onClick={() => onDelete(room.roomId, room.roomNumber)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Delete Room"> <Trash2 size={16} /> </button>
                      </RequirePermission>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 🌟 UPGRADED TypesTab to show Amenities Badges and Manage Button
function TypesTab({ types, isLoading, onAdd, onEdit, onDelete, onManageAmenities }) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-secondary-50/30">
        <h3 className="text-sm font-bold text-text">Room Types & Rates</h3>
        <div className="flex gap-2">
          {/* 🌟 NEW BUTTON: Manage Master Amenities */}
          <button 
            onClick={onManageAmenities} 
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary-100 text-text text-sm font-semibold rounded-lg hover:bg-secondary-200 transition shadow-sm border border-border"
          >
            <Tag size={16} /> Manage Amenities
          </button>
          
          <RequirePermission permission="CanCreateRoomType">
            <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
              <Plus size={16} /> Add Room Type
            </button>
          </RequirePermission>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-secondary-50/50 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Type Name</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Description & Amenities</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Max Guests</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase text-right">Base Price</th>
              <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr> <td colSpan="5" className="p-12 text-center text-text-muted animate-pulse">Loading room types...</td> </tr>
            ) : types.length === 0 ? (
              <tr> <td colSpan="5" className="p-12 text-center text-text-muted">No room types found. Click "Add Room Type" to create one.</td> </tr>
            ) : (
              types.map((type) => (
                <tr key={type.roomTypeId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-text">{type.typeName}</p>
                    <p className="text-xs text-text-muted">{type._count?.rooms || 0} Rooms assigned</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-text-muted max-w-xs truncate mb-2">{type.description || '-'}</p>
                    {/* 🌟 Display Amenities Badges */}
                    {type.amenities && type.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {type.amenities.map((link) => (
                          <span 
                            key={link.amenity.amenityId} 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary-100 text-secondary-700 border border-secondary-200"
                          >
                            <Tag size={10} />
                            {link.amenity.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-text">{type.maxOccupancy} Guests</td>
                  <td className="px-6 py-4 text-sm font-bold text-primary-600 text-right">GH₵ {parseFloat(type.basePrice || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <RequirePermission permission="CanUpdateRoomType">
                        <button onClick={() => onEdit(type)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="Edit Type"> <Edit2 size={16} /> </button>
                      </RequirePermission>
                      <RequirePermission permission="CanDeleteRoomType">
                        <button onClick={() => onDelete(type.roomTypeId, type.typeName)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Delete Type"> <Trash2 size={16} /> </button>
                      </RequirePermission>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoomModal({ room, roomTypes, propertyId, onClose, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    roomNumber: room?.roomNumber || '',
    roomTypeId: room?.roomTypeId || (roomTypes[0]?.roomTypeId || ''),
    floor: room?.floor || 1,
    operationalStatus: room?.operationalStatus || 'Available',
    housekeepingStatus: room?.housekeepingStatus || 'Clean',
    notes: room?.notes || '',
  });

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      propertyId,
      ...formData,
      roomTypeId: parseInt(formData.roomTypeId),
      floor: parseInt(formData.floor),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">{room ? 'Edit Room' : 'Add New Room'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted"> <X size={20} /> </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Room Number *</label>
              <input type="text" name="roomNumber" value={formData.roomNumber} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Floor *</label>
              <input type="number" name="floor" value={formData.floor} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Room Type *</label>
            <select name="roomTypeId" value={formData.roomTypeId} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
              <option value="">Select a type...</option>
              {roomTypes.map(t => <option key={t.roomTypeId} value={t.roomTypeId}>{t.typeName} (GH₵ {parseFloat(t.basePrice).toFixed(2)})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Operational Status</label>
              <select name="operationalStatus" value={formData.operationalStatus} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                <option value="Available">Available</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Housekeeping</label>
              <select name="housekeepingStatus" value={formData.housekeepingStatus} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                <option value="Clean">Clean</option>
                <option value="Dirty">Dirty</option>
                <option value="OutOfService">Out of Service</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />} {room ? 'Update Room' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}