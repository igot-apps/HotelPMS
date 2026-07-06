// frontend/src/components/users/UserModal.jsx
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getRoles } from '../../api/users';
import { getProperties } from '../../api/properties'; // Ensure this exists in your api folder

export default function UserModal({ isOpen, onClose, onSubmit, isLoading, editingUser }) {
  const [formData, setFormData] = useState({
    fullName: '', username: '', email: '', password: '',
    roleId: '', propertyId: '', isActive: true,
  });

  // Fetch Roles and Properties for dropdowns
  const { data: rolesData } = useQuery({ 
    queryKey: ['roles'], 
    queryFn: getRoles,
    select: (res) => res.data.data,
    enabled: isOpen,
  });
  
  const { data: propsData } = useQuery({ 
    queryKey: ['properties'], 
    queryFn: getProperties,
    select: (res) => res.data.data,
    enabled: isOpen,
  });

  const roles = rolesData || [];
  const properties = propsData || [];

  useEffect(() => {
    if (isOpen) {
      if (editingUser) {
        setFormData({
          fullName: editingUser.fullName || '',
          username: editingUser.username || '',
          email: editingUser.email || '',
          password: '', // Never pre-fill password
          roleId: editingUser.roleId?.toString() || '',
          propertyId: editingUser.propertyId?.toString() || '',
          isActive: editingUser.isActive,
        });
      } else {
        setFormData({ fullName: '', username: '', email: '', password: '', roleId: '', propertyId: '', isActive: true });
      }
    }
  }, [isOpen, editingUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...formData };
    // If editing and password is blank, remove it so backend doesn't hash an empty string
    if (editingUser && !payload.password) delete payload.password;
    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">{editingUser ? 'Edit Staff Member' : 'Add New Staff Member'}</h2>
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
              <label className="block text-sm font-semibold text-text mb-1.5">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">
                Password {editingUser ? '(Leave blank to keep current)' : '*'}
              </label>
              <input type="password" name="password" value={formData.password} onChange={handleChange} required={!editingUser} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Role *</label>
              <select name="roleId" value={formData.roleId} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                <option value="">Select Role...</option>
                {roles.map(r => <option key={r.roleId} value={r.roleId}>{r.roleName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Assigned Property</label>
              <select name="propertyId" value={formData.propertyId} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                <option value="">Unassigned</option>
                {properties.map(p => <option key={p.propertyId} value={p.propertyId}>{p.propertyName}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-3 p-3 bg-secondary-50 rounded-lg border border-border">
              <input type="checkbox" name="isActive" id="isActive" checked={formData.isActive} onChange={handleChange} className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
              <label htmlFor="isActive" className="text-sm font-semibold text-text cursor-pointer">Active Account</label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />} {editingUser ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}