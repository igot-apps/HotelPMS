import { Link } from 'react-router-dom';
import { Undo2, ArrowRight } from 'lucide-react';
import useRefundCount from '../../hooks/useRefundCount';
export default function RefundSummary() {
  const count = useRefundCount();
  if (!count.data?.ready && !count.isError) return null;
  return <Link to="/refunds" className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 text-primary-900"><span className="flex items-center gap-3"><Undo2 size={22} className="shrink-0" /><span><strong className="block">{count.isError ? 'Check approved refunds' : `${count.data.ready} approved refund${count.data.ready === 1 ? '' : 's'} ready to return`}</strong><span className="text-sm">{count.isError ? 'Refund count could not refresh. Open the queue to try again.' : 'View the queue and record money returned.'}</span></span></span><span className="flex items-center gap-2 text-sm font-semibold">Open refunds <ArrowRight size={18} /></span></Link>;
}
