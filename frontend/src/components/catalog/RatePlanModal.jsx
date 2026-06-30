import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { getRoomTypes } from '../../api/roomTypes';
import { useAuthStore } from '../../store/authStore';

export default function RatePlanModal({ isOpen, onClose, onSubmit, isLoading, initialData, error }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  const [roomTypes, setRoomTypes] = useState([]);
  const [formData, setFormData] = useState({
    roomTypeId: '',
    planName: '',
    description: '',
    discountPercent: '0',
    minStay: '1',
    maxStay: '14',
    isPublic: true,
  });

  // Fetch Room Types for the dropdown when modal opens
  useEffect(() => {
    if (isOpen && propertyId) {
      getRoomTypes({ propertyId, limit: 100 })
        .then(res => setRoomTypes(res.data.data || []))
        .catch(err => console.error(err));
    }
  }, [isOpen, propertyId]);

  // Populate form if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        roomTypeId: initialData.roomTypeId || '',
        planName: initialData.planName || '',
        description: initialData.description || '',
        discountPercent: initialData.discountPercent || '0',
        minStay: initialData.minStay || '1',
        maxStay: initialData.maxStay || '14',
        isPublic: initialData.isPublic ?? true,
      });
    } else {
      setFormData({
        roomTypeId: '', planName: '', description: '', discountPercent: '0',
        minStay: '1', maxStay: '14', isPublic: true,
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      roomTypeId: parseInt(formData.roomTypeId),
      discountPercent: parseFloat(formData.discountPercent),
      minStay: parseInt(formData.minStay),
      maxStay: parseInt(formData.maxStay),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">{initialData ? 'Edit Rate Plan' : 'Create Rate Plan'}</h2>
            <p className="text-sm text-text-muted mt-1">Define pricing rules and discounts for room types.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Plan Name *</label>
              <input type="text" name="planName" value={formData.planName} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="e.g. Weekend Special, Corporate Rate" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Room Type *</label>
              <select name="roomTypeId" value={formData.roomTypeId} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                <option value="">Select a room type...</option>
                {roomTypes.map(rt => (
                  <option key={rt.roomTypeId} value={rt.roomTypeId}>{rt.typeName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Discount Percentage (%)</label>
              <input type="number" step="0.01" name="discountPercent" value={formData.discountPercent} onChange={handleChange} min="0" max="100"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Minimum Stay (Nights)</label>
              <input type="number" name="minStay" value={formData.minStay} onChange={handleChange} min="1"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Maximum Stay (Nights)</label>
              <input type="number" name="maxStay" value={formData.maxStay} onChange={handleChange} min="1"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows="2"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition resize-none"
                placeholder="Optional details about this rate plan..." />
            </div>

            <div className="md:col-span-2 flex items-center gap-3 p-3 bg-secondary-50 rounded-lg border border-border">
              <input type="checkbox" name="isPublic" checked={formData.isPublic} onChange={handleChange} id="isPublic"
                className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
              <label htmlFor="isPublic" className="text-sm font-medium text-text cursor-pointer">
                Publicly visible (Available for online booking engines)
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={isLoading}
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              {initialData ? 'Save Changes' : 'Create Rate Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}