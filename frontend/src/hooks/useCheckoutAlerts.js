import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';

// Checkout reminders for front desk staff (due soon, due, overdue). Polls so alerts persist until resolved.
export default function useCheckoutAlerts() {
  const user = useAuthStore(state => state.user);
  return useQuery({
    queryKey: ['checkoutAlerts', user?.propertyId, user?.userId],
    enabled: ['Manager', 'Receptionist'].includes(user?.role) && Boolean(user?.propertyId),
    queryFn: async () => (await api.get('/reservations/checkout-alerts', { skipErrorToast: true })).data.data,
    refetchInterval: 60000,
    staleTime: 30000,
  });
}
