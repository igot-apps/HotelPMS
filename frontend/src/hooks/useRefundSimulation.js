import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';
export default function useRefundSimulation() {
  const user = useAuthStore(state => state.user);
  return useQuery({ queryKey: ['refunds', 'simulation-settings', user?.propertyId, user?.userId], enabled: ['Manager','Receptionist'].includes(user?.role) && Boolean(user?.propertyId), queryFn: async () => (await api.get('/reservations/refund-simulation/settings')).data.data, refetchInterval: 15000 });
}
