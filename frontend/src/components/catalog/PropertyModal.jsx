import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

export default function PropertyModal({ isOpen, onClose, onSubmit, isLoading, initialData, error }) {
  const [formData, setFormData] = useState({
    propertyName: '',
    propertyCode: '',
    propertyType: 'Hotel',
    address: '',
    city: '',
    country: 'Ghana',
    gpsCoordinates: '',
    totalRooms: 0,
    checkInTime: '14:00',
    checkOutTime: '11:00',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        propertyName: initialData.propertyName || '',
        propertyCode: initialData.propertyCode || '',
        propertyType: initialData.propertyType || 'Hotel',
        address: initialData.address || '',
        city: initialData.city || '',
        country: initialData.country || 'Ghana',
        gpsCoordinates: initialData.gpsCoordinates || '',
        totalRooms: initialData.totalRooms || 0,
        checkInTime: initialData.checkInTime || '14:00',
        checkOutTime: initialData.checkOutTime || '11:00',
      });
    } else {
      setFormData({
        propertyName: '', propertyCode: '', propertyType: 'Hotel', address: '',
        city: '', country: 'Ghana', gpsCoordinates: '', totalRooms: 0,
        checkInTime: '14:00', checkOutTime: '11:00',
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      totalRooms: parseInt(formData.totalRooms),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">{initialData ? 'Edit Property' : 'Add New Property'}</h2>
            <p className="text-sm text-text-muted mt-1">{initialData ? 'Update property details and policies.' : 'Register a new hotel location to your tenant.'}</p>
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
              <label className="block text-sm font-semibold text-text mb-1.5">Property Name *</label>
              <input type="text" name="propertyName" value={formData.propertyName} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="e.g. Brassfield Airport Hotel" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Property Code *</label>
              <input type="text" name="propertyCode" value={formData.propertyCode} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition uppercase"
                placeholder="e.g. BFH-AIR" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Property Type *</label>
              <select name="propertyType" value={formData.propertyType} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                <option value="Hotel">Hotel</option>
                <option value="Resort">Resort</option>
                <option value="Motel">Motel</option>
                <option value="Villa">Villa</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Address</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="12 Independence Ave" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">City</label>
              <input type="text" name="city" value={formData.city} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="Accra" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Country</label>
              <input type="text" name="country" value={formData.country} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="Ghana" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">GPS Coordinates (Latitude, Longitude)</label>
              <input type="text" name="gpsCoordinates" value={formData.gpsCoordinates} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="5.6037,-0.1870" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Total Rooms</label>
              <input type="number" name="totalRooms" value={formData.totalRooms} onChange={handleChange} min="0"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>

            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Check-in Time</label>
                <input type="time" name="checkInTime" value={formData.checkInTime} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Check-out Time</label>
                <input type="time" name="checkOutTime" value={formData.checkOutTime} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
              </div>
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
              {initialData ? 'Save Changes' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}