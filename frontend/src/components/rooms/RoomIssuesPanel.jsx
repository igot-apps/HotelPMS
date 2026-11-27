import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOpenRoomIssues, resolveRoomIssue } from '../../api/housekeeping';
import { useAuthStore } from '../../store/authStore';

const when = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

/**
 * Open room issues (usually reported by housekeeping). Reception decides what to do:
 * put the room in maintenance from its card if needed, then mark the issue resolved here.
 */
export default function RoomIssuesPanel() {
  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions) || [];
  const canResolve = permissions.includes('CanUpdateRoomStatus');
  const queryClient = useQueryClient();
  const queryKey = ['room-issues', user?.propertyId];
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const { data: issues = [] } = useQuery({ queryKey, queryFn: () => getOpenRoomIssues().then((res) => res.data.data), enabled: Boolean(user?.propertyId), refetchInterval: 60000 });
  const mutation = useMutation({
    mutationFn: ({ issueId, note: text }) => resolveRoomIssue(issueId, text),
    onSuccess: () => { setResolving(null); setNote(''); queryClient.invalidateQueries({ queryKey }); toast.success('Issue marked resolved.'); },
    onError: (error) => { toast.error(error.response?.data?.message || 'Could not resolve the issue.'); queryClient.invalidateQueries({ queryKey }); },
  });
  if (!issues.length) return null;

  return (
    <section aria-labelledby="room-issues-title" className="rounded-xl border border-warning-200 bg-warning-50 p-4">
      <h2 id="room-issues-title" className="flex items-center gap-2 font-bold text-warning-800"><AlertTriangle size={18} /> Room issues reported · {issues.length}</h2>
      <ul className="mt-3 space-y-2">
        {issues.map((issue) => (
          <li key={issue.issueId} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-text">Room {issue.roomNumber} · {issue.category}</p>
                {(issue.roomUnsuitable || issue.roomOperationalStatus === 'Maintenance') && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {issue.roomUnsuitable && <span className="whitespace-nowrap rounded-full bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">May be unsuitable for guests</span>}
                    {issue.roomOperationalStatus === 'Maintenance' && <span className="whitespace-nowrap rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-semibold text-secondary-700">In maintenance</span>}
                  </div>
                )}
                <p className="mt-0.5 break-words text-sm text-text">{issue.description}</p>
                <p className="mt-0.5 text-xs text-text-muted">{issue.reportedBy ? `${issue.reportedBy} · ` : ''}{when(issue.createdAt)}</p>
              </div>
              {canResolve && resolving !== issue.issueId && (
                <button type="button" onClick={() => { setResolving(issue.issueId); setNote(''); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold text-text hover:bg-secondary-50"><Check size={15} /> Resolve</button>
              )}
            </div>
            {resolving === issue.issueId && (
              <form className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ issueId: issue.issueId, note }); }}>
                <label htmlFor={`issue-note-${issue.issueId}`} className="sr-only">What was done (optional)</label>
                <input id={`issue-note-${issue.issueId}`} value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="What was done? (optional)" className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base text-text sm:flex-1" />
                <button type="submit" disabled={mutation.isPending} className="min-h-10 flex-1 rounded-lg sm:flex-none bg-primary-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving…' : 'Mark resolved'}</button>
                <button type="button" onClick={() => setResolving(null)} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold text-text">Cancel</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
