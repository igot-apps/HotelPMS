import { SkeletonTableRows } from '../components/ui/Skeleton';
import ResponsiveTable from '../components/ui/ResponsiveTable';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  getRooms, createRoom, updateRoom, updateRoomStatus,
  getRoomTypes, hardDeleteRoom, hardDeleteRoomType // 🌟 UPDATED IMPORTS
} from '../api/rooms';
import RequirePermission from '../components/RequirePermission';
import RoomTypeModal from '../components/catalog/RoomTypeModal';
import AmenityManagementModal from '../components/catalog/AmenityManagementModal';
import { MaintenanceReasonField, isValidMaintenanceReason } from '../components/rooms/MaintenanceReason';
import toast from 'react-hot-toast';
import {
  BedDouble, Layers, Plus, Edit2, Trash2, Loader2, Sparkles, AlertCircle, X, Tag, CheckCircle2, ArrowRight
} from 'lucide-react';

export default function RoomManagementPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('rooms');
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [isAmenityModalOpen, setIsAmenityModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [roomTypeToDelete, setRoomTypeToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

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
  const pickedStartTab = useRef(false);
  useEffect(() => {
    if (pickedStartTab.current || isLoadingTypes || !typesData) return;
    pickedStartTab.current = true;
    if (!typesData.length) setActiveTab('types');
  }, [typesData, isLoadingTypes]);
  const openNewType = () => { setActiveTab('types'); setEditingType(null); setIsTypeModalOpen(true); };
  const openNewRoom = () => { setActiveTab('rooms'); setEditingRoom(null); setIsRoomModalOpen(true); };
  const setupDone = roomTypes.length > 0 && rooms.length > 0;

  // Mutations
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

  // 🌟 HARD DELETE MUTATIONS
  const hardDeleteRoomMutation = useMutation({
    mutationFn: (id) => hardDeleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room permanently deleted.');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete room.'),
  });

  const hardDeleteRoomTypeMutation = useMutation({
    mutationFn: (id) => hardDeleteRoomType(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['roomTypes'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(response.data.message || 'Room type and assigned rooms permanently deleted.');
      setRoomTypeToDelete(null);
      setDeleteConfirmation('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete room type.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, data }) => updateRoomStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room status updated!');
    },
  });

  const handleSaveRoom = (data) => {
    if (editingRoom) {
      roomMutation.mutate({ id: editingRoom.roomId, data });
    } else {
      roomMutation.mutate({ data });
    }
  };

  //  SAFETY CHECK HANDLERS
  const handleDeleteRoom = (id, num) => {
    if (window.confirm(`⚠️ PERMANENTLY DELETE Room ${num}? This cannot be undone.`)) {
      hardDeleteRoomMutation.mutate(id);
    }
  };

  const handleDeleteType = (type) => {
    setDeleteConfirmation('');
    setRoomTypeToDelete(type);
  };

  const confirmDeleteType = (e) => {
    e.preventDefault();
    if (deleteConfirmation.trim().toLowerCase() !== 'delete' || !roomTypeToDelete) return;
    hardDeleteRoomTypeMutation.mutate(roomTypeToDelete.roomTypeId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Room Management</h1>
        <p className="text-text-muted text-sm mt-1">Set up your room types (with nightly prices), then add each room in the hotel.</p>
      </div>

      {!isLoadingTypes && !isLoadingRooms && !setupDone && (
        <SetupGuide hasTypes={roomTypes.length > 0} hasRooms={rooms.length > 0} onNewType={openNewType} onNewRoom={openNewRoom} />
      )}

      <div className="border-b border-border">
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <button 
            onClick={() => setActiveTab('types')} 
            className={`pb-3 text-sm font-semibold border-b-2 transition ${activeTab === 'types' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text'}`}
          >
            <Layers size={16} className="inline mr-2" /> 1. Room types & prices ({roomTypes.length})
          </button>
          <button 
            onClick={() => setActiveTab('rooms')} 
            className={`pb-3 text-sm font-semibold border-b-2 transition ${activeTab === 'rooms' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text'}`}
          >
            <BedDouble size={16} className="inline mr-2" /> 2. Rooms ({rooms.length})
          </button>
        </nav>
      </div>

      {activeTab === 'rooms' && (
        <RoomsTab 
          rooms={rooms} 
          roomTypes={roomTypes}
          isLoading={isLoadingRooms}
          onAdd={() => { setEditingRoom(null); setIsRoomModalOpen(true); }}
          onEdit={(room) => { setEditingRoom(room); setIsRoomModalOpen(true); }}
          onDelete={(id, num) => handleDeleteRoom(id, num)}
          onStatusChange={(id, op, hk) => statusMutation.mutate({ id, data: { operationalStatus: op, housekeepingStatus: hk } })}
          onNewType={openNewType}
        />
      )}

      {activeTab === 'types' && (
        <TypesTab 
          types={roomTypes} 
          isLoading={isLoadingTypes}
          onAdd={() => { setEditingType(null); setIsTypeModalOpen(true); }}
          onEdit={(type) => { setEditingType(type); setIsTypeModalOpen(true); }}
          onDelete={handleDeleteType}
          onManageAmenities={() => setIsAmenityModalOpen(true)} 
        />
      )}

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

      {isTypeModalOpen && (
        <RoomTypeModal 
          isOpen={isTypeModalOpen}
          initialData={editingType}
          onClose={() => { setIsTypeModalOpen(false); setEditingType(null); }}
          onSuccess={() => {
            const firstType = !editingType && roomTypes.length === 0;
            queryClient.invalidateQueries({ queryKey: ['roomTypes'] });
            toast.success(editingType ? 'Room type updated!' : firstType ? 'Room type created! Next: add your rooms.' : 'Room type created!');
            if (firstType) setActiveTab('rooms');
          }}
        />
      )}

      {isAmenityModalOpen && (
        <AmenityManagementModal 
          isOpen={isAmenityModalOpen} 
          onClose={() => {
            setIsAmenityModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['roomTypes'] }); 
          }} 
        />
      )}

      {roomTypeToDelete && (
        <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="presentation">
          <form onSubmit={confirmDeleteType} role="dialog" aria-modal="true" aria-labelledby="delete-room-type-title" className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border flex items-start gap-4">
              <div className="p-3 rounded-full bg-danger-50 text-danger-600"><AlertCircle size={22} /></div>
              <div className="flex-1">
                <h2 id="delete-room-type-title" className="text-lg font-bold text-text">Delete room type?</h2>
                <p className="mt-1 text-sm text-text-muted">This permanently deletes <span className="font-semibold text-text">{roomTypeToDelete.typeName}</span>, its {roomTypeToDelete._count?.rooms || 0} assigned room(s), and {roomTypeToDelete._count?.ratePlans || 0} rate plan(s). This cannot be undone.</p>
              </div>
              <button type="button" onClick={() => { setRoomTypeToDelete(null); setDeleteConfirmation(''); }} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted" aria-label="Close confirmation"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-text-muted">Reservation records and their room names stay in history. Deletion is blocked while pending, confirmed, or in-house stays use this type.</p>
              <label htmlFor="confirm-room-type-delete" className="block text-sm font-semibold text-text">Type <span className="font-mono text-danger-600">delete</span> to confirm</label>
              <input id="confirm-room-type-delete" autoFocus value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-danger-500/20 focus:border-danger-500" />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" disabled={hardDeleteRoomTypeMutation.isPending} onClick={() => { setRoomTypeToDelete(null); setDeleteConfirmation(''); }} className="px-4 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={deleteConfirmation.trim().toLowerCase() !== 'delete' || hardDeleteRoomTypeMutation.isPending} className="px-4 py-2.5 text-sm font-semibold text-white bg-danger-600 rounded-lg hover:bg-danger-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {hardDeleteRoomTypeMutation.isPending && <Loader2 className="animate-spin" size={16} />}
                  Delete room type
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Sub-Components
// ==========================================
// Shown until the hotel has at least one room type and one room: what to do, in order.
function SetupGuide({ hasTypes, hasRooms, onNewType, onNewRoom }) {
  const steps = [
    { done: hasTypes, title: 'Create a room type', text: 'A room type is a kind of room you sell, with its nightly price, e.g. "Standard – GHS 300" or "Deluxe – GHS 500".', action: !hasTypes && <button type="button" onClick={onNewType} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"><Plus size={16} /> Create room type</button> },
    { done: hasRooms, title: 'Add your rooms', text: 'Add each physical room by its number (e.g. 101, 102) and choose its room type. Guests are booked into these rooms.', action: hasTypes && !hasRooms && <button type="button" onClick={onNewRoom} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700"><Plus size={16} /> Add a room</button> },
    { done: false, title: 'Start taking bookings', text: 'Your rooms then appear in Check Availability and New Booking, and online if online booking is on in Properties.', action: hasTypes && hasRooms && <Link to="/reservations?new=1" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-secondary-50">New booking <ArrowRight size={16} /></Link> },
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <section aria-labelledby="room-setup-title" className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 sm:p-5">
      <h2 id="room-setup-title" className="text-base font-bold text-text">Set up your rooms in 2 steps</h2>
      <p className="mt-1 text-sm text-text-muted">Rooms belong to a room type, so create the room type first.</p>
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className={`rounded-lg border bg-surface p-4 ${index === current ? 'border-primary-400 shadow-sm' : 'border-border'} ${index > current ? 'opacity-60' : ''}`}>
            <p className="flex items-center gap-2 font-semibold text-text">
              {step.done ? <CheckCircle2 size={20} className="shrink-0 text-success-600" /> : <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === current ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-text-muted'}`}>{index + 1}</span>}
              {step.title}{step.done && <span className="text-xs font-normal text-success-700">· done</span>}
            </p>
            <p className="mt-1 text-sm text-text-muted">{step.text}</p>
            {step.action && <div className="mt-3">{step.action}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
function RoomsTab({ rooms, isLoading, onAdd, onEdit, onDelete, onStatusChange, roomTypes, onNewType }) {
  const hasRoomTypes = roomTypes && roomTypes.length > 0;

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-secondary-50/30">
        <h3 className="text-sm font-bold text-text">Rooms</h3>
        <RequirePermission permission="CanCreateRoom">
          {hasRoomTypes ? (
            <button onClick={onAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
              <Plus size={16} /> Add New Room
            </button>
          ) : (
            <button type="button" onClick={onNewType} className="inline-flex items-center gap-2 px-4 py-2 bg-warning-50 text-warning-700 text-sm font-semibold rounded-lg border border-warning-200 hover:bg-warning-100">
              <AlertCircle size={16} /> Create a room type first
            </button>
          )}
        </RequirePermission>
      </div>
      <div className="overflow-x-auto">
        <ResponsiveTable className="w-full text-left">
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
              <SkeletonTableRows colSpan="5" label="Loading rooms…" />
            ) : rooms.length === 0 ? (
              <tr> 
                <td colSpan="5" className="p-12 text-center text-text-muted">
                  {hasRoomTypes ? 'No rooms yet. Click "Add New Room" and enter each room number (e.g. 101), choosing its room type.' : 'Rooms need a room type first. Create one in "1. Room types & prices".'}
                </td> 
              </tr>
            ) : (
              rooms.map((room) => (
                <tr key={room.roomId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition">
                  <td className="px-6 py-4"> <p className="text-lg font-bold text-text">{room.roomNumber}</p> </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-text">{room.roomType?.typeName || 'No Type'}</p>
                    <p className="text-xs text-text-muted">Floor {room.floor}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${room.operationalStatus === 'Available' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
                      {room.operationalStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${room.housekeepingStatus === 'Clean' ? 'bg-primary-50 text-primary-700' : 'bg-danger-50 text-danger-700'}`}>
                      {room.housekeepingStatus === 'Dirty' ? 'Needs cleaning' : room.housekeepingStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <RequirePermission permission="CanUpdateRoomStatus">
                        <button onClick={() => onStatusChange(room.roomId, room.operationalStatus, room.housekeepingStatus === 'Clean' ? 'Dirty' : 'Clean')} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
                          <Sparkles size={16} />
                        </button>
                      </RequirePermission>
                      <RequirePermission permission="CanUpdateRoom">
                        <button onClick={() => onEdit(room)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"> <Edit2 size={16} /> </button>
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
        </ResponsiveTable>
      </div>
    </div>
  );
}

function TypesTab({ types, isLoading, onAdd, onEdit, onDelete, onManageAmenities }) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-border flex justify-between items-center bg-secondary-50/30">
        <h3 className="text-sm font-bold text-text">Room Types & Rates</h3>
        <div className="flex gap-2">
          <button onClick={onManageAmenities} className="inline-flex items-center gap-2 px-4 py-2 bg-secondary-100 text-text text-sm font-semibold rounded-lg hover:bg-secondary-200 transition shadow-sm border border-border">
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
        <ResponsiveTable className="w-full text-left">
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
              <SkeletonTableRows colSpan="5" rows={3} label="Loading room types…" />
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
                    {type.amenities && type.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {type.amenities.map((link) => (
                          <span key={link.amenity.amenityId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary-100 text-secondary-700 border border-secondary-200">
                            <Tag size={10} /> {link.amenity.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-text">{type.maxOccupancy} Guests</td>
                  <td className="px-6 py-4 text-sm font-bold text-primary-600 text-right">GHS {parseFloat(type.basePrice || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <RequirePermission permission="CanUpdateRoomType">
                        <button onClick={() => onEdit(type)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"> <Edit2 size={16} /> </button>
                      </RequirePermission>
                      <RequirePermission permission="CanDeleteRoomType">
                        <button 
                          onClick={() => onDelete(type)}
                          className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" 
                          title="Delete Type"
                        > 
                          <Trash2 size={16} /> 
                        </button>
                      </RequirePermission>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </ResponsiveTable>
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
  });

  const [maintenanceReason, setMaintenanceReason] = useState('');
  const needsReason = formData.operationalStatus === 'Maintenance' && room?.operationalStatus !== 'Maintenance';

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (needsReason && !isValidMaintenanceReason(maintenanceReason)) return;
    onSave({
      propertyId,
      ...formData,
      roomTypeId: parseInt(formData.roomTypeId),
      floor: parseInt(formData.floor),
      ...(needsReason ? { maintenanceReason: maintenanceReason.trim() } : {}),
    });
  };

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">{room ? 'Edit Room' : 'Add New Room'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted"> <X size={20} /> </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {roomTypes.map(t => <option key={t.roomTypeId} value={t.roomTypeId}>{t.typeName} (GHS {parseFloat(t.basePrice).toFixed(2)})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <option value="Dirty">Needs cleaning</option>
              </select>
            </div>
          </div>
          {needsReason && <MaintenanceReasonField onChange={setMaintenanceReason} disabled={isLoading} />}
          {room?.operationalStatus === 'Maintenance' && formData.operationalStatus === 'Maintenance' && room.maintenanceReason && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700"><strong>Maintenance reason:</strong> {room.maintenanceReason}</p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
            <button type="submit" disabled={isLoading || (needsReason && !isValidMaintenanceReason(maintenanceReason))} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />} {room ? 'Update Room' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
