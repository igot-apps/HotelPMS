import { useState, useEffect } from 'react';
import { X, Loader2, Globe, Save } from 'lucide-react';

export default function PropertyModal({ isOpen, onClose, onSubmit, isLoading, initialData }) {
  const [formData, setFormData] = useState({
    // Basic Info
    propertyName: '',
    propertyCode: '',
    propertyType: '',
    address: '',
    city: '',
    country: 'Ghana',
    primaryEmail: '',
    primaryPhone: '',
    
    // 🌟 NEW: Public Website & Billing Fields
    coverImage: '',
    galleryImages: '', // Handled as a comma-separated string in the UI
    publicDescription: '',
    cancellationPolicy: '',
    houseRules: '',
    taxPercentage: 0.00,
    isOnlineBookingEnabled: false,
  });

  // Populate form when editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        propertyName: initialData.propertyName || '',
        propertyCode: initialData.propertyCode || '',
        propertyType: initialData.propertyType || '',
        address: initialData.address || '',
        city: initialData.city || '',
        country: initialData.country || 'Ghana',
        primaryEmail: initialData.primaryEmail || '',
        primaryPhone: initialData.primaryPhone || '',
        
        // 🌟 Parse new fields
        coverImage: initialData.coverImage || '',
        galleryImages: Array.isArray(initialData.galleryImages) ? initialData.galleryImages.join(', ') : '',
        publicDescription: initialData.publicDescription || '',
        cancellationPolicy: initialData.cancellationPolicy || '',
        houseRules: initialData.houseRules || '',
        taxPercentage: initialData.taxPercentage ? parseFloat(initialData.taxPercentage) : 0.00,
        isOnlineBookingEnabled: initialData.isOnlineBookingEnabled || false,
      });
    } else {
      // Reset for new property
      setFormData({
        propertyName: '', propertyCode: '', propertyType: '', address: '', city: '', country: 'Ghana',
        primaryEmail: '', primaryPhone: '', coverImage: '', galleryImages: '', publicDescription: '',
        cancellationPolicy: '', houseRules: '', taxPercentage: 0.00, isOnlineBookingEnabled: false,
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 🌟 Parse comma-separated gallery string into an array for Prisma Json field
    const galleryArray = formData.galleryImages 
      ? formData.galleryImages.split(',').map(url => url.trim()).filter(url => url) 
      : [];

    const payload = {
      ...formData,
      galleryImages: galleryArray,
      taxPercentage: parseFloat(formData.taxPercentage) || 0.00,
    };

    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-xl border border-border">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">
            {initialData ? 'Edit Property Settings' : 'Add New Property'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* ========================================== */}
          {/* BASIC PROPERTY INFO */}
          {/* ========================================== */}
          <div>
            <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider text-text-muted">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Name *</label>
                <input type="text" name="propertyName" value={formData.propertyName} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Code *</label>
                <input type="text" name="propertyCode" value={formData.propertyCode} onChange={handleChange} required disabled={!!initialData} placeholder="e.g., royal-palm" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Type *</label>
                <select name="propertyType" value={formData.propertyType} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="">Select type...</option>
                  <option value="Hotel">Hotel</option>
                  <option value="Motel">Motel</option>
                  <option value="Guesthouse">Guesthouse</option>
                  <option value="Resort">Resort</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Country *</label>
                <input type="text" name="country" value={formData.country} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-text mb-1.5">Address</label>
                <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">City</label>
                <input type="text" name="city" value={formData.city} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Primary Phone</label>
                <input type="text" name="primaryPhone" value={formData.primaryPhone} onChange={handleChange} placeholder="024xxxxxxx" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-text mb-1.5">Primary Email</label>
                <input type="email" name="primaryEmail" value={formData.primaryEmail} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* 🌟 PUBLIC WEBSITE SETTINGS SECTION */}
          {/* ========================================== */}
          <div className="pt-6 mt-6 border-t border-border">
            <h3 className="text-sm font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-2">
              <Globe size={16} className="text-primary-600" /> Public Website Profile
            </h3>
            <p className="text-xs text-text-muted mb-4">This information will be displayed on your public booking page (myapp.com).</p>

            {/* Online Booking Master Toggle */}
            <div className="flex items-center justify-between p-4 bg-primary-50 border border-primary-100 rounded-lg mb-6">
              <div className="flex-1">
                <label className="text-sm font-bold text-text">Accept Online Bookings</label>
                <p className="text-xs text-text-muted mt-0.5">
                  When enabled, your hotel will be visible and bookable on the public website.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  name="isOnlineBookingEnabled"
                  checked={formData.isOnlineBookingEnabled}
                  onChange={handleChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            {/* Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Cover Image URL</label>
                <input 
                  type="url" 
                  name="coverImage" 
                  value={formData.coverImage} 
                  onChange={handleChange} 
                  placeholder="https://..." 
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Gallery Images (Comma Separated URLs)</label>
                <input 
                  type="text" 
                  name="galleryImages" 
                  value={formData.galleryImages} 
                  onChange={handleChange} 
                  placeholder="url1, url2, url3" 
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                />
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5">Public Description</label>
              <textarea 
                name="publicDescription" 
                value={formData.publicDescription} 
                onChange={handleChange} 
                rows="3" 
                placeholder="Tell guests about your hotel, location, and vibe..." 
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 resize-none" 
              />
            </div>

            {/* Policies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Cancellation Policy</label>
                <textarea 
                  name="cancellationPolicy" 
                  value={formData.cancellationPolicy} 
                  onChange={handleChange} 
                  rows="3" 
                  placeholder="e.g., Free cancellation up to 24 hours before check-in." 
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 resize-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">House Rules</label>
                <textarea 
                  name="houseRules" 
                  value={formData.houseRules} 
                  onChange={handleChange} 
                  rows="3" 
                  placeholder="e.g., No smoking, No pets, Quiet hours after 10 PM." 
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 resize-none" 
                />
              </div>
            </div>

            {/* Tax Rate */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5">Tax Percentage (%)</label>
              <input 
                type="number" 
                name="taxPercentage" 
                step="0.01"
                value={formData.taxPercentage} 
                onChange={handleChange} 
                placeholder="0.00" 
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
              />
              <p className="text-xs text-text-muted mt-1">This tax will be automatically added to all online bookings at checkout.</p>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              <Save size={16} />
              {initialData ? 'Update Property' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}