import { useState, useEffect } from 'react';
import { X, Loader2, Edit2, Trash2, Save, Tag, AlertCircle } from 'lucide-react';
import { getAmenities, updateAmenity, deleteAmenity } from '../../api/amenities';
import toast from 'react-hot-toast';

export default function AmenityManagementModal({ isOpen, onClose }) {
  const [amenities, setAmenities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  // Fetch amenities whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAmenities();
    }
  }, [isOpen]);

  const fetchAmenities = async () => {
    setIsLoading(true);
    try {
      const res = await getAmenities();
      setAmenities(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load amenities');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      await updateAmenity(id, { name: editName.trim() });
      toast.success('Amenity updated!');
      setEditingId(null);
      fetchAmenities(); // Refresh list to show updated name
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update');
    }
  };

  const handleDelete = async (id, name, usageCount) => {
    let confirmMsg = `Are you sure you want to delete "${name}"?`;
    
    // 🚨 Smart warning if the amenity is actively being used
    if (usageCount > 0) {
      confirmMsg += `\n\n⚠️ WARNING: This amenity is currently used by ${usageCount} Room Type(s). Deleting it will automatically remove it from those rooms.`;
    }
    
    if (window.confirm(confirmMsg)) {
      try {
        await deleteAmenity(id);
        toast.success('Amenity deleted.');
        fetchAmenities();
      } catch (err) {
        toast.error('Failed to delete amenity.');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-xl border border-border overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-text flex items-center gap-2">
              <Tag size={20} className="text-primary-600" /> Manage Master Amenities
            </h2>
            <p className="text-xs text-text-muted mt-1">Rename or delete amenities. Changes apply to all Room Types.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
              <Loader2 className="animate-spin" size={24} /> Loading amenities...
            </div>
          ) : amenities.length === 0 ? (
            <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2">
              <AlertCircle size={24} />
              <p>No amenities created yet. Create them while adding a Room Type!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {amenities.map((amenity) => {
                const isEditing = editingId === amenity.amenityId;
                const usageCount = amenity._count?.roomTypes || 0;

                return (
                  <div 
                    key={amenity.amenityId} 
                    className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:border-primary-300 transition"
                  >
                    {/* Left Side: Name & Usage Stats */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          className="flex-1 px-3 py-1.5 bg-surface border border-primary-500 rounded text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text truncate">{amenity.name}</p>
                          <p className={`text-[10px] font-bold uppercase ${usageCount > 0 ? 'text-primary-600' : 'text-text-muted'}`}>
                            {usageCount > 0 ? `Used by ${usageCount} Room Type${usageCount > 1 ? 's' : ''}` : 'Not currently used'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right Side: Action Buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      {isEditing ? (
                        <>
                          <button 
                            onClick={() => handleSaveEdit(amenity.amenityId)} 
                            className="p-2 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 transition" 
                            title="Save Changes"
                          >
                            <Save size={16} />
                          </button>
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" 
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setEditingId(amenity.amenityId); setEditName(amenity.name); }} 
                            className="p-2 rounded-lg hover:bg-primary-50 text-primary-600 transition" 
                            title="Edit Name"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(amenity.amenityId, amenity.name, usageCount)} 
                            className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" 
                            title="Delete Amenity"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}