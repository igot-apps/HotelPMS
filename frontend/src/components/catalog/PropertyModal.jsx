import { useState, useEffect } from 'react';
import { X, Loader2, Globe, Save, Smartphone } from 'lucide-react';

export default function PropertyModal({ isOpen, onClose, onSubmit, isLoading, initialData }) {
  const [formData, setFormData] = useState({
    propertyName: '', propertyCode: '', propertyType: '', address: '', city: '', country: 'Ghana',
    primaryEmail: '', primaryPhone: '', coverImage: '', galleryImages: '', publicDescription: '',
    cancellationPolicy: '', houseRules: '', taxPercentage: 0.00, isOnlineBookingEnabled: false,
    paystackSecretKey: '',
  });

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
        coverImage: initialData.coverImage || '',
        galleryImages: Array.isArray(initialData.galleryImages) ? initialData.galleryImages.join(', ') : '',
        publicDescription: initialData.publicDescription || '',
        cancellationPolicy: initialData.cancellationPolicy || '',
        houseRules: initialData.houseRules || '',
        taxPercentage: initialData.taxPercentage ? parseFloat(initialData.taxPercentage) : 0.00,
        isOnlineBookingEnabled: initialData.isOnlineBookingEnabled || false,
        paystackSecretKey: initialData.paystackSecretKey || '',
      });
    } else {
      setFormData({
        propertyName: '', propertyCode: '', propertyType: '', address: '', city: '', country: 'Ghana',
        primaryEmail: '', primaryPhone: '', coverImage: '', galleryImages: '', publicDescription: '',
        cancellationPolicy: '', houseRules: '', taxPercentage: 0.00, isOnlineBookingEnabled: false,
        paystackSecretKey: '',
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const galleryArray = formData.galleryImages 
      ? formData.galleryImages.split(',').map(url => url.trim()).filter(url => url) 
      : [];

    // 🌟 CRITICAL: Only send the Paystack key if it's a NEW value (not the masked version)
    const shouldUpdatePaystackKey = formData.paystackSecretKey && !formData.paystackSecretKey.includes('...');

    const payload = {
      ...formData,
      galleryImages: galleryArray,
      taxPercentage: parseFloat(formData.taxPercentage) || 0.00,
      // 🌟 Conditionally include the key
      ...(shouldUpdatePaystackKey && { paystackSecretKey: formData.paystackSecretKey }),
    };

    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-xl border border-border">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">{initialData ? 'Edit Property Settings' : 'Add New Property'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info (Unchanged for brevity, keep your existing basic info fields here) */}
          <div>
            <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider text-text-muted">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Name *</label>
                <input type="text" name="propertyName" value={formData.propertyName} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Code *</label>
                <input type="text" name="propertyCode" value={formData.propertyCode} onChange={handleChange} required disabled={!!initialData} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50" />
              </div>
              {/* ... keep your other basic fields (Type, Country, Address, City, Phone, Email) ... */}
            </div>
          </div>

          {/* Public Website Settings */}
          <div className="pt-6 mt-6 border-t border-border">
            <h3 className="text-sm font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-2">
              <Globe size={16} className="text-primary-600" /> Public Website Profile
            </h3>
            
            {/* Online Booking Toggle */}
            <div className="flex items-center justify-between p-4 bg-primary-50 border border-primary-100 rounded-lg mb-6">
              <div className="flex-1">
                <label className="text-sm font-bold text-text">Accept Online Bookings</label>
                <p className="text-xs text-text-muted mt-0.5">When enabled, your hotel will be visible and bookable on the public website.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="isOnlineBookingEnabled" checked={formData.isOnlineBookingEnabled} onChange={handleChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            {/* Images, Description, Policies (Keep your existing fields here) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Cover Image URL</label>
                <input type="url" name="coverImage" value={formData.coverImage} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Gallery Images (Comma Separated)</label>
                <input type="text" name="galleryImages" value={formData.galleryImages} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5">Tax Percentage (%)</label>
              <input type="number" name="taxPercentage" step="0.01" value={formData.taxPercentage} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>

            {/* 🌟 NEW: Paystack Mobile Money Integration */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5 flex items-center gap-2">
                <Smartphone size={16} className="text-primary-600" />
                Paystack Secret Key (Mobile Money)
              </label>
              <input 
                type="password" 
                name="paystackSecretKey" 
                value={formData.paystackSecretKey} 
                onChange={handleChange} 
                placeholder="sk_live_... or sk_test_..." 
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 font-mono text-sm" 
              />
              <p className="text-xs text-text-muted mt-1">
                Your hotel's Paystack secret key for Mobile Money payments (MTN MoMo, Vodafone Cash, AirtelTigo). 
                <a href="https://dashboard.paystack.com/#/settings/developer" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline ml-1">Get your key here →</a>
              </p>
              {initialData?.paystackSecretKey && (
                <p className="text-xs text-warning-600 mt-1">⚠️ Leave blank to keep your current key. Enter a new key to replace it.</p>
              )}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition">Cancel</button>
            <button type="submit" disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              <Save size={16} /> {initialData ? 'Update Property' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}