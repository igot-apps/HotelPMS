import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSubscriptionStatus } from '../../api/billing';
import { useAuthStore } from '../../store/authStore';

/** "4 of 20 rooms on your plan" with a way to Billing & Plan; only for people who can manage billing. */
export default function AllowanceHint({ kind }) {
  const canBill = useAuthStore((state) => state.user?.permissions?.includes('CanManageBilling'));
  const { data } = useQuery({
    queryKey: ['subscriptionStatus'],
    queryFn: () => fetchSubscriptionStatus().then((r) => r.data.data),
    enabled: Boolean(canBill),
    staleTime: 60_000,
  });
  const used = data?.usage?.[kind];
  const limit = data?.limits?.[kind];
  if (!canBill || used == null || !limit) return null;
  const full = used >= limit;
  const noun = kind === 'rooms' ? 'rooms' : 'staff accounts';
  return (
    <p className={`text-sm ${full ? 'text-warning-800' : 'text-text-muted'}`}>
      {used} of {limit} {noun} on your plan{full ? ' — limit reached.' : '.'}{' '}
      <Link to="/billing" className="font-semibold text-primary-700 hover:underline">{full ? 'Upgrade plan' : 'Billing & Plan'}</Link>
    </p>
  );
}
