import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Plus, Power, PowerOff, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  deactivatePlatformAdmin, getPlatformAdminActivity, removePlatformAdmin, getPlatformAdmins, invitePlatformAdmin, reactivatePlatformAdmin, resendPlatformInvite,
} from '../api/platformAdmins';

const ACTION_LABELS = {
  PlatformAdminInvited: 'Invited administrator', PlatformAdminInviteResent: 'Resent invitation', PlatformAdminInviteRevoked: 'Revoked invitation',
  PlatformAdminInvitationAccepted: 'Accepted invitation', PlatformAdminDeactivated: 'Deactivated administrator', PlatformAdminReactivated: 'Reactivated administrator',
  PlatformAdminPasswordChanged: 'Changed password', PlatformAdminPasswordResetRequested: 'Requested password reset', PlatformAdminPasswordReset: 'Reset password by email link',
  PlatformAdminEmailChangeRequested: 'Requested email change', PlatformAdminEmailChanged: 'Changed email', PlatformAdminNameChanged: 'Changed name',
  PlatformAdminEmergencyRecovery: 'Emergency recovery (server script)', PlatformAdminRemoved: 'Removed unused administrator record',
  PlatformAdminDefaultCreated: 'Default administrator created', PlatformAdminDefaultRestored: 'Default administrator restored',
};
const when = (value) => (value ? new Date(value).toLocaleString() : '—');

function status(admin) {
  if (admin.invitationPending) return { label: 'Invitation pending', cls: 'bg-warning-50 text-warning-800' };
  return admin.isActive ? { label: 'Active', cls: 'bg-success-50 text-success-700' } : { label: 'Inactive', cls: 'bg-secondary-100 text-text-muted' };
}

export default function PlatformAdminsPage({ currentUserId }) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '' });
  const admins = useQuery({ queryKey: ['platform-admins'], queryFn: async () => (await getPlatformAdmins()).data.data });
  const activity = useQuery({ queryKey: ['platform-admin-activity'], queryFn: async () => (await getPlatformAdminActivity()).data.data });
  const nameOf = (id) => admins.data?.find((a) => a.userId === id)?.fullName || `#${id}`;
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['platform-admins'] }); queryClient.invalidateQueries({ queryKey: ['platform-admin-activity'] }); };

  const invite = useMutation({
    mutationFn: () => invitePlatformAdmin(form),
    onSuccess: (res) => {
      toast[res.data.data.emailSent ? 'success' : 'error'](res.data.data.emailSent ? 'Invitation sent.' : 'Administrator added, but the email was not sent. Use Resend invite.');
      setForm({ fullName: '', email: '' }); setInviteOpen(false); refresh();
    },
  });
  const act = useMutation({
    mutationFn: ({ kind, id }) => ({ resend: resendPlatformInvite, deactivate: deactivatePlatformAdmin, reactivate: reactivatePlatformAdmin, remove: removePlatformAdmin }[kind])(id),
    onSuccess: (res, { kind }) => {
      if (kind === 'resend') toast[res.data.data.emailSent ? 'success' : 'error'](res.data.data.emailSent ? 'Invitation resent.' : 'The email was not sent. Try again later.');
      else toast.success({ deactivate: 'Access removed and sessions signed out.', reactivate: 'Administrator reactivated.', remove: 'Record removed. Its history stays in the activity log.' }[kind]);
      refresh();
    },
  });

  const confirmAndRun = (kind, admin) => {
    if (kind === 'remove' && !window.confirm(`Remove ${admin.email || admin.fullName}? This frees the email for a new invitation. The history stays in the activity log.`)) return;
    if (kind === 'deactivate' && !window.confirm(admin.invitationPending ? `Revoke the invitation for ${admin.email}?` : `Deactivate ${admin.fullName}? They will be signed out immediately.`)) return;
    act.mutate({ kind, id: admin.userId });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Administrators</h1><p className="text-sm text-text-muted">People who can manage every hotel on the platform. Every change is recorded below.</p></div>
        <button onClick={() => setInviteOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700"><Plus size={16} /> Invite administrator</button>
      </div>

      {inviteOpen && (
        <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-medium">Full name<input required minLength={2} maxLength={200} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background p-2.5" /></label>
          <label className="text-sm font-medium">Email<input required type="email" maxLength={200} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background p-2.5" /></label>
          <button disabled={invite.isPending} className="rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{invite.isPending ? 'Sending…' : 'Send invitation'}</button>
          <p className="text-xs text-text-muted sm:col-span-3">They receive a one-time link (valid 24 hours) to set their own password. Pending invitations cannot sign in.</p>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary-50 text-left text-xs uppercase tracking-wide text-text-muted"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Last sign-in</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody>
            {admins.isLoading && <tr><td colSpan={5} className="p-4 text-text-muted">Loading…</td></tr>}
            {admins.data?.map((admin) => {
              const s = status(admin);
              const self = admin.userId === currentUserId;
              return (
                <tr key={admin.userId} className="border-t border-border">
                  <td className="p-3 font-medium">{admin.fullName}{admin.isDefault && <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">Default</span>}{self && <span className="ml-2 text-xs text-text-muted">(you)</span>}</td>
                  <td className="p-3">{admin.email || <span className="text-warning-700">No email yet</span>}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span></td>
                  <td className="p-3 text-text-muted">{when(admin.lastLoginAt)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      {admin.invitationPending && admin.isActive && <button onClick={() => confirmAndRun('resend', admin)} disabled={act.isPending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold"><Mail size={14} /> Resend invite</button>}
                      {admin.isActive && !self && !admin.isDefault && <button onClick={() => confirmAndRun('deactivate', admin)} disabled={act.isPending} className="inline-flex items-center gap-1 rounded-lg border border-danger-200 px-2 py-1 text-xs font-semibold text-danger-700"><PowerOff size={14} /> {admin.invitationPending ? 'Revoke' : 'Deactivate'}</button>}
                      {!admin.isActive && !admin.lastLoginAt && !admin.isDefault && <button onClick={() => confirmAndRun('remove', admin)} disabled={act.isPending} className="inline-flex items-center gap-1 rounded-lg border border-danger-200 px-2 py-1 text-xs font-semibold text-danger-700"><Trash2 size={14} /> Remove</button>}
                      {!admin.isActive && <button onClick={() => confirmAndRun('reactivate', admin)} disabled={act.isPending} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold"><Power size={14} /> Reactivate</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Administrator activity</h2><button onClick={refresh} className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"><RefreshCw size={14} /> Refresh</button></div>
        {activity.data?.length ? (
          <ul className="divide-y divide-border text-sm">
            {activity.data.map((row) => (
              <li key={row.auditLogId} className="flex flex-wrap justify-between gap-2 py-2">
                <span><strong>{row.user?.fullName || 'System'}</strong> — {ACTION_LABELS[row.action] || row.action}{row.entityId && row.entityId !== row.userId ? ` (${nameOf(row.entityId)})` : ''}</span>
                <span className="text-text-muted">{when(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-text-muted">{activity.isLoading ? 'Loading…' : 'No administrator activity yet.'}</p>}
      </section>
    </div>
  );
}
