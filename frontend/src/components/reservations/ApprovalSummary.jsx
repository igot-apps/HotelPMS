import { Link } from 'react-router-dom';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import useApprovalCount from '../../hooks/useApprovalCount';
export default function ApprovalSummary() {
  const query = useApprovalCount();
  const count = query.data?.actionRequired ?? query.data?.pending;
  return <Link to="/approvals" className="flex min-h-20 items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 text-text sm:p-5"><ClipboardCheck className="shrink-0 text-primary-700" size={24} /><div className="min-w-0 flex-1"><h2 className="font-bold">{query.isError ? 'Approvals · unable to refresh count' : count === undefined ? 'Checking approvals…' : count ? `${count} ${count === 1 ? 'request needs' : 'requests need'} your attention` : 'Approvals are up to date'}</h2><p className="mt-1 text-sm text-text-muted">{count ? 'Review approvals and refunds still to return.' : 'Open the inbox to view requests and history.'}</p></div><span className="hidden text-sm font-semibold text-primary-700 sm:inline">Open approvals</span><ArrowRight size={18} className="shrink-0 text-primary-700" /></Link>;
}
