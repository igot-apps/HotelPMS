// frontend/src/pages/UsersPage.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser, deactivateUser } from '../api/users';
import UserModal from '../components/users/UserModal';
import RequirePermission from '../components/RequirePermission';
import toast from 'react-hot-toast';
import { Shield, Plus, Edit2, Trash2, Search, Building2 } from 'lucide-react';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers().then(res => res.data.data),
  });

  const users = usersData || [];
  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role?.roleName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const mutation = useMutation({
    mutationFn: ({ id, data }) => id ? updateUser(id, data) : createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(editingUser ? 'User updated!' : 'User created!');
      setIsModalOpen(false);
      setEditingUser(null);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save user'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deactivated.');
    },
  });

  const handleSave = (data) => {
    if (editingUser) {
      mutation.mutate({ id: editingUser.userId, data });
    } else {
      mutation.mutate({ data });
    }
  };

  const handleDeactivate = (id, name) => {
    if (window.confirm(`Deactivate ${name}? They will no longer be able to log in.`)) {
      deactivateMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <Shield size={24} className="text-primary-500" /> Staff Management
          </h1>
          <p className="text-text-muted text-sm mt-1">Manage system users, roles, and property assignments.</p>
        </div>
        <RequirePermission permission="CanManageStaffAndRoles">
          <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-text-inverted text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm">
            <Plus size={16} /> Add Staff Member
          </button>
        </RequirePermission>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input type="text" placeholder="Search staff..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary-50/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Staff Member</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Role</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Property</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-text-muted uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="5" className="p-12 text-center text-text-muted animate-pulse">Loading staff...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan="5" className="p-12 text-center text-text-muted">No staff members found.</td></tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.userId} className="border-b border-border last:border-0 hover:bg-secondary-50/50 transition">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-text">{user.fullName}</p>
                      <p className="text-xs text-text-muted">@{user.username} • {user.email || 'No email'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-primary-50 text-primary-700">
                        <Shield size={12} /> {user.role?.roleName}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-muted flex items-center gap-1.5">
                      <Building2 size={14} /> {user.property?.propertyName || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${user.isActive ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <RequirePermission permission="CanManageStaffAndRoles">
                          <button onClick={() => { setEditingUser(user); setIsModalOpen(true); }} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition" title="Edit User">
                            <Edit2 size={16} />
                          </button>
                        </RequirePermission>
                        <RequirePermission permission="CanManageStaffAndRoles">
                          <button onClick={() => handleDeactivate(user.userId, user.fullName)} className="p-2 rounded-lg hover:bg-danger-50 text-danger-600 transition" title="Deactivate User" disabled={!user.isActive}>
                            <Trash2 size={16} />
                          </button>
                        </RequirePermission>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UserModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingUser(null); }} 
        onSubmit={handleSave} 
        isLoading={mutation.isPending} 
        editingUser={editingUser} 
      />
    </div>
  );
}