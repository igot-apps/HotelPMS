// AvailabilityPage.jsx
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAvailableRooms } from '../api/rooms';
import { createReservation } from '../api/reservations';
import { recordPayment } from '../api/payments';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import toast from 'react-hot-toast';
import { 
  Search, Calendar, BedDouble, AlertCircle, Users, ChevronRight, Loader2, ShoppingCart, CheckCircle2
} from 'lucide-react';

export default function AvailabilityPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();

  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  
  // 🌟 State to track selected rooms
  const [selectedRooms, setSelectedRooms] = useState([]);
  
  // State for the single global booking modal
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  // Set default dates (Today to Tomorrow)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    setCheckInDate(today);
    setCheckOutDate(tomorrow);
  }, []);

  // 🌟 Reset selected rooms when search parameters change to prevent stale data
  useEffect(() => {
    setSelectedRooms([]);
  }, [checkInDate, checkOutDate]);

  // Fetch available rooms
  const { data, isLoading, error } = useQuery({
    queryKey: ['availability', checkInDate, checkOutDate, hasSearched],
    queryFn: () => getAvailableRooms(checkInDate, checkOutDate, propertyId).then(res => res.data.data),
    enabled: hasSearched && !!checkInDate && !!checkOutDate && !!propertyId,
  });

  const availableRooms = data || [];
  
  // Calculate nights for price estimation
  const nights = Math.max(1, Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24)));

  const handleSearch = (e) => {
    e.preventDefault();
    if (checkInDate && checkOutDate) {
      setHasSearched(true);
    }
  };

  // 🌟 Toggle room selection by clicking the card
  const toggleRoomSelection = (roomId) => {
    setSelectedRooms(prev => 
      prev.includes(roomId) 
        ? prev.filter(id => id !== roomId)
        : [...prev, roomId]
    );
  };

  // Handle clicking the global "Proceed to Book" button
  const handleProceedToBook = () => {
    if (selectedRooms.length === 0) {
      toast.error('Please select at least one room to proceed.');
      return;
    }
    setIsBookingModalOpen(true);
  };

  // Handle booking submission from the Modal
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

      toast.success('Reservation created successfully!');
      
      // 3. Close modal, clear selections, and refresh availability
      setIsBookingModalOpen(false);
      setSelectedRooms([]); 
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      
    } catch (err) {
      console.error('Booking failed:', err);
    }
  };

  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);

  // 🌟 Calculate total estimated price for selected rooms
  const selectedTotal = selectedRooms.reduce((sum, id) => {
    const room = availableRooms.find(r => r.roomId === id);
    const basePrice = parseFloat(room?.roomType?.basePrice || 0);
    return sum + (basePrice * nights);
  }, 0);

  return (
    <div className="space-y-6 pb-28"> {/* pb-28 prevents content hiding behind sticky button */}
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Search size={24} className="text-primary-500" /> Check Availability
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Search for free rooms by date range. Click on the rooms you want to select them, then proceed to book.
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">
              <Calendar size={16} className="inline mr-1.5" /> Check-in Date
            </label>
            <input 
              type="date" 
              value={checkInDate} 
              onChange={(e) => setCheckInDate(e.target.value)} 
              required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">
              <Calendar size={16} className="inline mr-1.5" /> Check-out Date
            </label>
            <input 
              type="date" 
              value={checkOutDate} 
              onChange={(e) => setCheckOutDate(e.target.value)} 
              required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" 
            />
          </div>
          <div className="flex items-end">
            <button 
              type="submit" 
              className="w-full px-4 py-2.5 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 shadow-sm"
            >
              <Search size={18} /> Search Availability
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {hasSearched && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="bg-surface border border-border rounded-xl p-12 text-center text-text-muted animate-pulse">
              Searching available rooms...
            </div>
          ) : error ? (
            <div className="bg-surface border border-border rounded-xl p-12 text-center text-danger-600">
              <AlertCircle size={24} className="mx-auto mb-2" />
              <p className="font-semibold">Failed to load availability</p>
            </div>
          ) : availableRooms.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-12 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 rounded-full bg-warning-50 text-warning-600">
                  <AlertCircle size={32} />
                </div>
                <div>
                  <p className="text-lg font-bold text-text">No Rooms Available</p>
                  <p className="text-sm text-text-muted mt-1">
                    All rooms are booked for this date range. Try different dates.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-text-muted">
                Found <span className="text-primary-600 font-bold">{availableRooms.length}</span> available room{availableRooms.length !== 1 ? 's' : ''} for {nights} night{nights !== 1 ? 's' : ''}.
              </p>
              
              {/* Room Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {availableRooms.map((room) => {
                  const basePrice = parseFloat(room.roomType?.basePrice || 0);
                  const roomTotal = basePrice * nights;
                  const isSelected = selectedRooms.includes(room.roomId);

                  return (
                    <div 
                      key={room.roomId} 
                      onClick={() => toggleRoomSelection(room.roomId)}
                      className={`bg-surface border rounded-xl p-5 transition-all flex flex-col relative cursor-pointer hover:shadow-md ${
                        isSelected 
                          ? 'border-primary-500 ring-2 ring-primary-500/20 bg-primary-50/30' 
                          : 'border-border hover:border-primary-300'
                      }`}
                    >
                      {/* 🌟 Selection Indicator (Checkmark Badge) */}
                      {isSelected && (
                        <div className="absolute top-3 right-3 bg-primary-500 text-white rounded-full p-1 shadow-sm">
                          <CheckCircle2 size={18} />
                        </div>
                      )}

                      {/* Room Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-lg ${isSelected ? 'bg-primary-100 text-primary-600' : 'bg-primary-50 text-primary-600'}`}>
                            <BedDouble size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-text">Room {room.roomNumber}</h3>
                            <p className="text-xs text-text-muted">Floor {room.floor}</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-success-50 text-success-700 text-xs font-bold rounded-md">
                          Available
                        </span>
                      </div>

                      {/* Room Details */}
                      <div className="space-y-2 mb-4 flex-1">
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                          <BedDouble size={14} />
                          <span className="font-medium text-text">{room.roomType?.typeName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                          <Users size={14} />
                          <span>Up to {room.roomType?.maxOccupancy || 2} Guests</span>
                        </div>
                      </div>

                      {/* Pricing Display */}
                      <div className="border-t border-border pt-4 mt-auto">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs text-text-muted">GH₵ {formatCurrency(basePrice)} × {nights} nights</span>
                          <span className={`text-xl font-bold ${isSelected ? 'text-primary-600' : 'text-text'}`}>
                            GH₵ {formatCurrency(roomTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Initial State (Before Search) */}
      {!hasSearched && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
            <div className="p-4 rounded-full bg-secondary-50 text-secondary-600">
              <Search size={40} />
            </div>
            <div>
              <p className="text-lg font-bold text-text">Search for Available Rooms</p>
              <p className="text-sm text-text-muted mt-1">
                Select your check-in and check-out dates above to see real-time room availability.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 🚨 SINGLE GLOBAL ACTION BAR                */}
      {/* ========================================== */}
      {hasSearched && availableRooms.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border shadow-2xl z-40 p-4 flex items-center justify-between backdrop-blur-md bg-surface/95">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-full bg-primary-100 text-primary-600">
              <ShoppingCart size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-text">
                {selectedRooms.length} of {availableRooms.length} Rooms Selected
              </p>
              <p className="text-xs text-text-muted">
                Total Estimated: GH₵ {formatCurrency(selectedTotal)}
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleProceedToBook}
            disabled={selectedRooms.length === 0}
            className={`px-6 py-3 font-bold rounded-lg transition flex items-center gap-2 shadow-lg ${
              selectedRooms.length === 0 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-success-600 text-text-inverted hover:bg-success-700'
            }`}
          >
            Proceed to Book <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* Booking Modal                              */}
      {/* ========================================== */}
      <ReservationModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onSubmit={handleBookingSubmit}
        isLoading={false}
        initialData={{
          checkInDate,
          checkOutDate,
          // 🌟 Pass ONLY the selected room IDs. The modal will pre-select them in Step 2.
          roomIds: selectedRooms, 
        }}
      />
    </div>
  );
}