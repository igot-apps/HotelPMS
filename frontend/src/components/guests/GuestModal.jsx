import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

// Added 'error' to the props
export default function GuestModal({ isOpen, onClose, onSubmit, isLoading, initialData, error }) {
  const [formData, setFormData] = useState({
    fullName: '', phone: '', email: '', idNumber: '', address: '', city: '', country: 'Ghana',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        fullName: initialData.fullName || '', phone: initialData.phone || '',
        email: initialData.email || '', idNumber: initialData.idNumber || '',
        address: initialData.address || '', city: initialData.city || '',
        country: initialData.country || 'Ghana',
      });
    } else {
      setFormData({ fullName: '', phone: '', email: '', idNumber: '', address: '', city: '', country: 'Ghana' });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(formData); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-xl border border-border overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">{initialData ? 'Edit Guest Profile' : 'Add New Guest'}</h2>
            <p className="text-sm text-text-muted mt-1">{initialData ? 'Update guest information.' : 'Register a new guest to the system.'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* NEW: Error Alert Box */}
          {error && (
            <div className="p-3 bg-danger-50 border border-danger-100 text-danger-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Full Name *</label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="e.g. Kwame Asante" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Phone Number *</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="0244123456" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Email Address</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="guest@email.com" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">ID / Passport Number</label>
              <input type="text" name="idNumber" value={formData.idNumber} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="GHA-001" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">City</label>
              <input type="text" name="city" value={formData.city} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="Accra" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Address</label>
              <input type="text" name="address" value={formData.address} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
                placeholder="123 Main Street" />
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
              {initialData ? 'Save Changes' : 'Add Guest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}