import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { createRoomType, updateRoomType } from '../../api/roomTypes';
import { getAmenities } from '../../api/amenities';
import InlineTagSelect from '../ui/InlineTagSelect';
import toast from 'react-hot-toast';

export default function RoomTypeModal({ isOpen, onClose, onSuccess, initialData }) {
  const [isLoading, setIsLoading] = useState(false);
  
  const [amenitiesList, setAmenitiesList] = useState([]);
  const [selectedAmenityIds, setSelectedAmenityIds] = useState([]);

  const [formData, setFormData] = useState({
    typeName: '',
    description: '',
    basePrice: '',
    maxOccupancy: 1,
  });

  useEffect(() => {
    if (isOpen) {
      getAmenities()
        .then(res => setAmenitiesList(res.data.data || []))
        .catch(err => console.error('Failed to load amenities', err));

      if (initialData) {
        setFormData({
          typeName: initialData.typeName || '',
          description: initialData.description || '',
          basePrice: initialData.basePrice || '',
          maxOccupancy: initialData.maxOccupancy || 1,
        });
        const existingAmenityIds = initialData.amenities?.map(a => a.amenity.amenityId) || [];
        setSelectedAmenityIds(existingAmenityIds);
      } else {
        setFormData({ typeName: '', description: '', basePrice: '', maxOccupancy: 1 });
        setSelectedAmenityIds([]);
      }
    }
  }, [isOpen, initialData]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = {
        typeName: formData.typeName,
        description: formData.description,
        basePrice: parseFloat(formData.basePrice),
        maxOccupancy: parseInt(formData.maxOccupancy),
        amenityIds: selectedAmenityIds, 
      };

      if (initialData) {
        await updateRoomType(initialData.roomTypeId, payload);
        toast.success('Room type updated successfully!');
      } else {
        await createRoomType(payload);
        toast.success('Room type created successfully!');
      }

      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save room type');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    // 🌟 FIX: Changed to items-start and overflow-y-auto so the dropdown doesn't get clipped!
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      
      {/* 🌟 FIX: Removed overflow-hidden and max-h so the dropdown can escape the box */}
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border">
        
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">
            {initialData ? 'Edit Room Type' : 'Add New Room Type'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Type Name *</label>
            <input
              type="text"
              name="typeName"
              value={formData.typeName}
              onChange={handleChange}
              required
              placeholder="e.g., Deluxe Suite"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Base Price (GH₵) *</label>
              <input
                type="number"
                name="basePrice"
                value={formData.basePrice}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Max Occupancy *</label>
              <input
                type="number"
                name="maxOccupancy"
                value={formData.maxOccupancy}
                onChange={handleChange}
                required
                min="1"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Brief description of the room type..."
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition resize-none"
            />
          </div>

          {/* 🌟 INLINE TAGGING COMPONENT FOR AMENITIES */}
          <InlineTagSelect 
            label="Room Amenities"
            options={amenitiesList}
            selectedIds={selectedAmenityIds}
            onChange={setSelectedAmenityIds}
            onCreateNew={(newAmenity) => setAmenitiesList(prev => [...prev, newAmenity])}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              {initialData ? 'Update Room Type' : 'Create Room Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}