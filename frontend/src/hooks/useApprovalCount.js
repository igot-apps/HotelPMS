import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';
export default function useApprovalCount() {
  const user = useAuthStore(state => state.user);
  return useQuery({ queryKey: ['correctionRequests', 'count', user?.propertyId, user?.userId], enabled: user?.role === 'Manager' && Boolean(user?.propertyId), queryFn: async () => (await api.get('/reservations/approval-inbox/count')).data.data, refetchInterval: 15000, staleTime: 10000 });
}
