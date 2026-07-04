import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAvailableRooms } from '../api/rooms';
import { createReservation } from '../api/reservations';
import { recordPayment } from '../api/payments';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import { Search, Calendar, BedDouble, TrendingUp, AlertCircle, Check, ChevronRight, Users, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AvailabilityPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();

  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false); // NEW: Modal state

  // Set default dates
  useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    setCheckInDate(today);
    setCheckOutDate(tomorrow);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['availability', checkInDate, checkOutDate, hasSearched],
    queryFn: () => getAvailableRooms(checkInDate, checkOutDate, propertyId).then(res => res.data.data),
    enabled: hasSearched && !!checkInDate && !!checkOutDate && !!propertyId,
  });

  const availableRooms = data || [];
  
  const nights = Math.max(1, Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24)));
  const estimatedTotal = selectedRooms.reduce((acc, r) => acc + (parseFloat(r.roomType?.basePrice || 0) * nights), 0);

  const toggleRoomSelection = (room) => {
    const isSelected = selectedRooms.some(r => r.roomId === room.roomId);
    if (isSelected) {
      setSelectedRooms(selectedRooms.filter(r => r.roomId !== room.roomId));
    } else {
      setSelectedRooms([...selectedRooms, room]);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (checkInDate && checkOutDate) {
      setHasSearched(true);
      setSelectedRooms([]);
    }
  };

  // NEW: Open booking modal directly
  const handleProceedToBooking = () => {
    if (selectedRooms.length === 0) return;
    setIsBookingModalOpen(true);
  };

  // NEW: Handle booking submission
  const handleBookingSubmit = async (payload) => {
    try {
      // 1. Create reservation
      const resResponse = await createReservation(payload);
      const newReservation = resResponse.data.data;

      // 2. Record initial payment if applicable
      if (payload.initialPayment > 0.01) {
        const paymentPayload = {
          reservationId: newReservation.reservationId,
          amount: payload.initialPayment,
          paymentMethod: payload.paymentMethod,
          propertyId: payload.propertyId,
          gatewayReference: payload.gatewayReference || null,
          notes: 'Initial payment for reservation'
        };
        await recordPayment(paymentPayload);
      }

      // 3. Success feedback
      toast.success('Reservation created successfully!');
      
      // 4. Close modal and refresh availability
      setIsBookingModalOpen(false);
      setSelectedRooms([]);
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      
    } catch (err) {
      console.error('Booking failed:', err);
      // Global toast will handle the error message
    }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Search size={24} className="text-primary-500" /> Availability Search
        </h1>
        <p className="text-text-muted text-sm mt-1">Select multiple rooms and proceed to batch booking.</p>
      </div>

      {/* Search Form */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5"><Calendar size={16} className="inline mr-1.5" />Check-in</label>
            <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5"><Calendar size={16} className="inline mr-1.5" />Check-out</label>
            <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full px-4 py-2.5 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 shadow-sm">
              <Search size={18} /> Search Availability
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="bg-surface border border-border rounded-xl p-12 text-center text-text-muted animate-pulse">Searching available rooms...</div>
          ) : availableRooms.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-12 text-center">
              <AlertCircle size={32} className="mx-auto mb-2 text-warning-600" />
              <p className="text-lg font-bold text-text">No Rooms Available</p>
              <p className="text-sm text-text-muted mt-1">All rooms are booked for this date range.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableRooms.map((room) => {
                const isSelected = selectedRooms.some(r => r.roomId === room.roomId);
                const roomTotal = parseFloat(room.roomType?.basePrice || 0) * nights;

                return (
                  <button 
                    type="button"
                    key={room.roomId} 
                    onClick={() => toggleRoomSelection(room)}
                    className={`relative text-left bg-surface border rounded-xl p-5 transition-all hover:shadow-md ${
                      isSelected 
                        ? 'border-primary-500 ring-2 ring-primary-500/20 bg-primary-50/30' 
                        : 'border-border hover:border-primary-300'
                    }`}
                  >
                    <div className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition ${
                      isSelected ? 'bg-primary-600 text-white' : 'bg-secondary-100 text-text-muted border border-border'
                    }`}>
                      {isSelected && <Check size={14} />}
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary-100 text-primary-600' : 'bg-secondary-50 text-secondary-600'}`}>
                        <BedDouble size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-text">Room {room.roomNumber}</h3>
                        <p className="text-xs text-text-muted">Floor {room.floor}</p>
                      </div>
                    </div>

                    <div className="space-y-1 mb-4 text-sm text-text-muted">
                      <p><Users size={14} className="inline mr-1.5" />{room.roomType?.maxOccupancy || 2} Guests</p>
                      <p><BedDouble size={14} className="inline mr-1.5" />{room.roomType?.typeName}</p>
                    </div>

                    <div className="border-t border-border pt-3 flex justify-between items-baseline">
                      <span className="text-xs text-text-muted">GH₵ {formatCurrency(room.roomType?.basePrice)} × {nights} nights</span>
                      <span className="text-lg font-bold text-primary-600">GH₵ {formatCurrency(roomTotal)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      {hasSearched && availableRooms.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border shadow-2xl z-40 p-4 flex items-center justify-between backdrop-blur-md bg-surface/95">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full bg-primary-100 text-primary-600">
              <ShoppingCart size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-text">
                {selectedRooms.length} Room{selectedRooms.length !== 1 ? 's' : ''} Selected
              </p>
              <p className="text-xs text-text-muted">
                Estimated Total: <span className="font-bold text-primary-600">GH₵ {formatCurrency(estimatedTotal)}</span>
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleProceedToBooking}
            disabled={selectedRooms.length === 0}
            className="px-6 py-3 bg-success-600 text-text-inverted font-bold rounded-lg hover:bg-success-700 transition flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Proceed to Booking <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* NEW: Booking Modal (Directly on this page) */}
      {/* ========================================== */}
      <ReservationModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onSubmit={handleBookingSubmit}
        isLoading={false}
        initialData={{
          checkInDate,
          checkOutDate,
          roomIds: selectedRooms.map(r => r.roomId),
        }}
      />
    </div>
  );
}