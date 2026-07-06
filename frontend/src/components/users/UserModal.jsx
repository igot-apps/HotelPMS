import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getRoles } from '../../api/users'; 
import { getProperties } from '../../api/properties'; 

export default function UserModal({ isOpen, onClose, onSubmit, isLoading, editingUser }) {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    roleId: '',
    propertyId: '',
    isActive: true,
  });

  // 1. Fetch Roles for the dropdown
  const { data: rolesData, isLoading: isLoadingRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
    select: (res) => res.data.data, // Extract the array from { success: true, data: [...] }
    enabled: isOpen, // Only fetch when modal is open
  });

  // 2. Fetch Properties for the dropdown
  const { data: propsData, isLoading: isLoadingProps } = useQuery({
    queryKey: ['properties'],
    queryFn: getProperties,
    select: (res) => res.data.data,
    enabled: isOpen,
  });

  const roles = rolesData || [];
  const properties = propsData || [];

  // 3. Reset form when modal opens/closes or editingUser changes
  useEffect(() => {
    if (isOpen) {
      if (editingUser) {
        setFormData({
          fullName: editingUser.fullName || '',
          username: editingUser.username || '',
          email: editingUser.email || '',
          password: '', // Never pre-fill password for security
          roleId: editingUser.roleId?.toString() || '',
          propertyId: editingUser.propertyId?.toString() || '',
          isActive: editingUser.isActive !== undefined ? editingUser.isActive : true,
        });
      } else {
        setFormData({
          fullName: '',
          username: '',
          email: '',
          password: '',
          roleId: '',
          propertyId: '',
          isActive: true,
        });
      }
    }
  }, [isOpen, editingUser]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // If editing and password is blank, remove it from payload so backend doesn't try to hash an empty string
    const payload = { ...formData };
    if (editingUser && !payload.password) {
      delete payload.password;
    }
    
    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-text">
            {editingUser ? 'Edit Staff Member' : 'Add New Staff Member'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Full Name */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">Full Name *</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Username *</label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              />
            </div>

            {/* Password */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text mb-1.5">
                Password {editingUser ? '(Leave blank to keep current)' : '*'}
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!editingUser}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              />
            </div>

            {/* Role Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Role *</label>
              <select
                name="roleId"
                value={formData.roleId}
                onChange={handleChange}
                required
                disabled={isLoadingRoles}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              >
                <option value="">{isLoadingRoles ? 'Loading roles...' : 'Select Role...'}</option>
                {roles.map((r) => (
                  <option key={r.roleId} value={r.roleId}>
                    {r.roleName}
                  </option>
                ))}
              </select>
            </div>

            {/* Property Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Assigned Property</label>
              <select
                name="propertyId"
                value={formData.propertyId}
                onChange={handleChange}
                disabled={isLoadingProps}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              >
                <option value="">{isLoadingProps ? 'Loading properties...' : 'Unassigned / All'}</option>
                {properties.map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.propertyName}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Status Toggle */}
            <div className="md:col-span-2 flex items-center gap-3 p-3 bg-secondary-50 rounded-lg border border-border">
              <input
                type="checkbox"
                name="isActive"
                id="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="isActive" className="text-sm font-semibold text-text cursor-pointer">
                Active Account (User can log in)
              </label>
            </div>
          </div>

          {/* Footer Actions */}
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
              className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              {editingUser ? 'Update Staff' : 'Create Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}