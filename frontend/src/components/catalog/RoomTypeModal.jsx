import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

export default function RoomTypeModal({ isOpen, onClose, onSubmit, isLoading, initialData, error }) {
  const [formData, setFormData] = useState({
    typeName: '',
    description: '',
    basePrice: '',
    maxOccupancy: 2,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        typeName: initialData.typeName || '',
        description: initialData.description || '',
        basePrice: initialData.basePrice || '',
        maxOccupancy: initialData.maxOccupancy || 2,
      });
    } else {
      setFormData({ typeName: '', description: '', basePrice: '', maxOccupancy: 2 });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      basePrice: parseFloat(formData.basePrice),
      maxOccupancy: parseInt(formData.maxOccupancy),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">{initialData ? 'Edit Room Type' : 'Add New Room Type'}</h2>
            <p className="text-sm text-text-muted mt-1">{initialData ? 'Update category details and base pricing.' : 'Create a new room category for your property.'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Type Name *</label>
            <input type="text" name="typeName" value={formData.typeName} onChange={handleChange} required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              placeholder="e.g. Deluxe Suite, Standard Single" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows="2"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition resize-none"
              placeholder="e.g. Luxury suite with separate living area and city view" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Base Price (GHS) *</label>
              <input type="number" step="0.01" name="basePrice" value={formData.basePrice} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Max Occupancy *</label>
              <input type="number" name="maxOccupancy" value={formData.maxOccupancy} onChange={handleChange} required min="1"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
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
              {initialData ? 'Save Changes' : 'Create Room Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}