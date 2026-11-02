// frontend/src/components/users/UserModal.jsx
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';


export default function UserModal({ isOpen, onClose, onSubmit, isLoading, editingUser }) {
  const [formData, setFormData] = useState({
    fullName: '', username: '', email: '', isActive: false,
  });

  useEffect(() => {
    if (isOpen) {
      if (editingUser) {
        setFormData({
          fullName: editingUser.fullName || '',
          username: editingUser.username || '',
          email: editingUser.email || '',
          isActive: editingUser.isActive,
        });
      } else {
        setFormData({ fullName: '', username: '', email: '', isActive: false });
      }
    }
  }, [isOpen, editingUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">{editingUser ? 'Edit Staff Member' : 'Invite Receptionist'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Full Name *</label>
              <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Username *</label>
              <input type="text" name="username" value={formData.username} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Email *</label>
              <input type="email" name="email" required value={formData.email} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>

            <p className="text-sm text-text-muted">Role: Receptionist. The receptionist sets their own password using an invitation link.</p>

            {editingUser ? <div className="md:col-span-2 flex items-center gap-3 p-3 bg-secondary-50 rounded-lg border border-border">
              <input type="checkbox" name="isActive" id="isActive" disabled={editingUser?.invitationPending || !editingUser} checked={formData.isActive} onChange={handleChange} className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
              <label htmlFor="isActive" className="text-sm font-semibold text-text cursor-pointer">Active Account</label>
            </div> : <p className="md:col-span-2 rounded-lg border border-border bg-secondary-50 p-3 text-sm text-text-muted">The account becomes active after the receptionist sets their password.</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />} {editingUser ? 'Update User' : 'Create Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
