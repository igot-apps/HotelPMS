import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReservationById, getReservationStats, updateReservation } from '../api/reservations';
import { useAuthStore } from '../store/authStore';
import { 
  ArrowLeft, User, BedDouble, CreditCard, FileText, Edit2, X, Loader2, 
  CalendarDays, DollarSign, Clock, CheckCircle2, AlertCircle 
} from 'lucide-react';

export default function ReservationDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState({ notes: '', source: '' });

  // 1. Fetch Data
  const { data: resData, isLoading: isLoadingRes } = useQuery({
    queryKey: ['reservation', id],
    queryFn: () => getReservationById(id).then(res => res.data.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['reservationStats', id],
    queryFn: () => getReservationStats(id).then(res => res.data.data),
  });

  // 2. Update Mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateReservation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation', id] });
      setIsEditModalOpen(false);
    },
  });

  const openEditModal = () => {
    setEditData({ notes: resData?.notes || '', source: resData?.source || '' });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    updateMutation.mutate(editData);
  };

  if (isLoadingRes) return <div className="p-8 text-center text-text-muted">Loading reservation details...</div>;
  if (!resData) return <div className="p-8 text-center text-danger-600">Reservation not found.</div>;

  const fmt = (val) => parseFloat(val || 0).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text">Reservation #{resData.reservationId}</h1>
            <p className="text-sm text-text-muted flex items-center gap-2 mt-1">
              <CalendarDays size={14} /> 
              {new Date(resData.checkInDate).toLocaleDateString()} → {new Date(resData.checkOutDate).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
            resData.status === 'CheckedIn' ? 'bg-success-50 text-success-700' :
            resData.status === 'Confirmed' ? 'bg-primary-50 text-primary-700' :
            resData.status === 'Cancelled' ? 'bg-danger-50 text-danger-700' : 'bg-secondary-100 text-secondary-700'
          }`}>
            {resData.status}
          </span>
          <button onClick={openEditModal} className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:bg-secondary-50 transition">
            <Edit2 size={16} /> Edit Details
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="Total Amount" value={`${fmt(statsData?.totalAmount)} GHS`} color="primary" />
        <StatCard icon={CreditCard} label="Total Paid" value={`${fmt(statsData?.totalPaid)} GHS`} color="success" />
        <StatCard icon={AlertCircle} label="Balance Due" value={`${fmt(statsData?.balanceDue)} GHS`} color={statsData?.balanceDue > 0 ? "danger" : "success"} />
        <StatCard icon={Clock} label="Total Nights" value={`${statsData?.totalNights || 0} Nights`} color="secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Guest Info */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-lg font-bold text-text mb-4 flex items-center gap-2"><User size={18} /> Guest Information</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-muted uppercase font-semibold">Full Name</p>
              <Link to={`/guests`} className="text-sm font-bold text-primary-600 hover:underline">{resData.guest?.fullName}</Link>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase font-semibold">Phone</p>
              <p className="text-sm text-text">{resData.guest?.phone}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase font-semibold">Email</p>
              <p className="text-sm text-text">{resData.guest?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase font-semibold">Booking Source</p>
              <p className="text-sm text-text font-medium">{resData.source}</p>
            </div>
          </div>
        </div>

        {/* Room Assignments */}
        <div className="lg:col-span-2 bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-lg font-bold text-text mb-4 flex items-center gap-2"><BedDouble size={18} /> Assigned Rooms</h3>
          <div className="space-y-3">
            {resData.reservationRooms?.map((rr) => (
              <div key={rr.reservationRoomId} className="flex items-center justify-between p-4 bg-secondary-50 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-bold text-text">Room {rr.room?.roomNumber}</p>
                  <p className="text-xs text-text-muted">{rr.room?.roomType?.typeName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary-600">{fmt(rr.agreedPricePerNight)} GHS</p>
                  <p className="text-xs text-text-muted">per night</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
        <h3 className="text-lg font-bold text-text mb-4 flex items-center gap-2"><CreditCard size={18} /> Payment History</h3>
        {resData.payments?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary-50/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Date</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Method</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase">Status</th>
                  <th className="px-4 py-2 text-xs font-semibold text-text-muted uppercase text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {resData.payments.map(p => (
                  <tr key={p.paymentId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm text-text">{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{p.paymentMethod}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded-md text-xs font-semibold bg-success-50 text-success-700">{p.status}</span></td>
                    <td className="px-4 py-3 text-sm font-bold text-text text-right">{fmt(p.amount)} GHS</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted text-center py-4">No payments recorded yet.</p>
        )}
      </div>

      {/* Edit Notes Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold text-text">Edit Reservation</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Booking Source</label>
                <select value={editData.source} onChange={(e) => setEditData({...editData, source: e.target.value})} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="Walk-in">Walk-in</option>
                  <option value="Phone">Phone</option>
                  <option value="Website">Website</option>
                  <option value="Direct">Direct</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Internal Notes</label>
                <textarea value={editData.notes} onChange={(e) => setEditData({...editData, notes: e.target.value})} rows="3" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
                <button type="submit" disabled={updateMutation.isPending} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                  {updateMutation.isPending && <Loader2 className="animate-spin" size={16} />} Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600', success: 'bg-success-50 text-success-600',
    danger: 'bg-danger-50 text-danger-600', secondary: 'bg-secondary-100 text-secondary-600',
  };
  return (
    <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}><Icon size={18} /></div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{label}</p>
      </div>
      <h3 className="text-2xl font-bold text-text">{value}</h3>
    </div>
  );
}