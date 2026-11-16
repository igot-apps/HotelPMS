import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GlobeLock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/axios';

// Manager switch: lets one receptionist hide or show rooms on the hotel website.
export default function OnlineRoomPermission({ user }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(Boolean(user.canManageOnlineRooms));
  const mutation = useMutation({
    mutationFn: (next) => api.put(`/users/${user.userId}/online-room-permission`, { enabled: next }),
    onSuccess: (response) => {
      const next = response.data.data.canManageOnlineRooms;
      setEnabled(next);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(next ? `${user.fullName} can now hide rooms from online booking.` : `${user.fullName} can no longer hide rooms from online booking.`);
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not update this permission.'),
  });

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <GlobeLock size={18} className="mt-0.5 shrink-0 text-primary-600" />
        <div>
          <h2 className="font-bold text-text">Hide rooms from online booking</h2>
          <p className="mt-0.5 text-sm text-text-muted">Let {user.fullName} hide or show individual rooms on the hotel website. Front-desk booking is not affected.</p>
        </div>
      </div>
      <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm font-semibold text-text">
        {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
        <input type="checkbox" role="switch" checked={enabled} disabled={mutation.isPending} onChange={(event) => mutation.mutate(event.target.checked)} className="h-5 w-5 accent-primary-600" />
        {enabled ? 'Allowed' : 'Not allowed'}
      </label>
    </section>
  );
}
