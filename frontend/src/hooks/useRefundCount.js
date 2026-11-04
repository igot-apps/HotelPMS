import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';
export default function useRefundCount() {
  const user = useAuthStore(state => state.user);
  return useQuery({ queryKey: ['refunds', 'ready-count', user?.propertyId, user?.userId], enabled: ['Manager', 'Receptionist'].includes(user?.role) && Boolean(user?.propertyId), queryFn: async () => (await api.get('/reservations/refund-inbox/count')).data.data, refetchInterval: 15000, staleTime: 10000 });
}
