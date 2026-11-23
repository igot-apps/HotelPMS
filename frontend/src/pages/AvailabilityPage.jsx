import { SkeletonCards } from '../components/ui/Skeleton';
// AvailabilityPage.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, defaultToday } from '../lib/period';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAvailableRooms } from '../api/rooms';
import { createReservation } from '../api/reservations';
import { recordPayment } from '../api/payments';
import { useAuthStore } from '../store/authStore';
import ReservationModal from '../components/reservations/ReservationModal';
import { createWalkInBooking } from '../lib/createWalkInBooking';
import toast from 'react-hot-toast';
import {
  Search, Calendar, BedDouble, AlertCircle, Users, ChevronRight, Loader2, ShoppingCart, CheckCircle2
} from 'lucide-react';

export default function AvailabilityPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  
  // 🌟 State to track selected rooms
  const [selectedRooms, setSelectedRooms] = useState([]);
  
  // State for the single global booking modal
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const savingBookingRef = useRef(false);
  const bookingInitialData = useMemo(() => ({
    checkInDate, checkOutDate, roomIds: selectedRooms,
  }), [checkInDate, checkOutDate, selectedRooms]);

  // 🌟 HELPER: Prevent past dates and invalid ranges
  const today = defaultToday();
  const getMinCheckOut = (checkIn) => {
    if (!checkIn) return today;
    const nextDay = new Date(checkIn);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.toISOString().split('T')[0];
  };

  // Set default dates (Today to Tomorrow)
  useEffect(() => {
    const tomorrow = addDays(today, 1);
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

  // Room type filter and sort (client-side; selections are kept across filters)
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('type');
  const roomTypeOptions = useMemo(() => {
    const types = new Map();
    for (const room of availableRooms) {
      const key = String(room.roomType?.roomTypeId ?? room.roomTypeId ?? 'other');
      const entry = types.get(key) || { key, name: room.roomType?.typeName || 'Other', count: 0 };
      entry.count += 1;
      types.set(key, entry);
    }
    return [...types.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableRooms]);
  useEffect(() => {
    if (typeFilter !== 'all' && !roomTypeOptions.some((option) => option.key === typeFilter)) setTypeFilter('all');
  }, [roomTypeOptions, typeFilter]);
  const visibleRooms = useMemo(() => {
    const byNumber = (a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
    const price = (room) => parseFloat(room.roomType?.basePrice || 0);
    const sorters = {
      type: (a, b) => (a.roomType?.typeName || '').localeCompare(b.roomType?.typeName || '') || byNumber(a, b),
      room: byNumber,
      'price-low': (a, b) => price(a) - price(b) || byNumber(a, b),
      'price-high': (a, b) => price(b) - price(a) || byNumber(a, b),
    };
    return availableRooms
      .filter((room) => typeFilter === 'all' || String(room.roomType?.roomTypeId ?? room.roomTypeId ?? 'other') === typeFilter)
      .sort(sorters[sortBy]);
  }, [availableRooms, typeFilter, sortBy]);

  // Calculate nights for price estimation
  const nights = Math.max(1, Math.ceil((new Date(checkOutDate) - new Date(checkInDate)) / (1000 * 60 * 60 * 24)));

  const handleSearch = (e) => {
    e.preventDefault();
    if (checkInDate && checkOutDate) {
      // 🌟 Double-check validation before searching
      if (new Date(checkInDate) >= new Date(checkOutDate)) {
        toast.error('Departure date must be after arrival date.');
        return;
      }
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
    if (savingBookingRef.current) return;
    savingBookingRef.current = true;
    setIsSavingBooking(true);
    try {
      const { reservation, paymentError } = await createWalkInBooking(payload, { createReservation, recordPayment });
      if (paymentError) {
        toast.error('Reservation saved. Review its initial payment below.');
      } else {
        toast.success('Reservation created successfully!');
      }
      
      // 3. Close modal, clear selections, and refresh availability
      setIsBookingModalOpen(false);
      setSelectedRooms([]); 
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      navigate('/bookings', { state: paymentError ? { paymentRecoveryReservation: reservation } : undefined });
    } catch (err) {
      console.error('Booking failed:', err);
      toast.error(err.response?.data?.message || 'Failed to create reservation.');
    } finally {
      savingBookingRef.current = false;
      setIsSavingBooking(false);
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
    <div className="space-y-6 pb-44 sm:pb-28"> {/* Space for the mobile booking action bar. */}
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Search size={24} className="text-primary-500" /> Check Availability
        </h1>
        <p className="text-text-muted text-sm mt-1">
          See which rooms are free for your dates. Tap rooms to select them, then book — it opens the same New booking form used on Reservations.
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
              min={today} // 🌟 Prevents selecting past dates
              required
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">
              <Calendar size={16} className="inline mr-1.5" /> Departure Date
            </label>
            <input 
              type="date" 
              value={checkOutDate} 
              onChange={(e) => setCheckOutDate(e.target.value)} 
              min={getMinCheckOut(checkInDate)} // 🌟 Prevents selecting a date before or equal to check-in
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
            <SkeletonCards count={3} className="space-y-4" cardClassName="h-32" label="Searching available rooms…" />
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-sm font-semibold text-text-muted">
                  Found <span className="text-primary-600 font-bold">{availableRooms.length}</span> available room{availableRooms.length !== 1 ? 's' : ''} for {nights} night{nights !== 1 ? 's' : ''}.
                  {typeFilter !== 'all' && <> Showing <span className="text-text font-bold">{visibleRooms.length}</span>.</>}
                </p>
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  Sort by
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text outline-none focus:border-primary-500">
                    <option value="type">Room type</option>
                    <option value="room">Room number</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                  </select>
                </label>
              </div>

              {/* Room type filter */}
              {roomTypeOptions.length > 1 && (
                <div role="group" aria-label="Filter by room type" className="flex flex-wrap gap-2">
                  {[{ key: 'all', name: 'All types', count: availableRooms.length }, ...roomTypeOptions].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={typeFilter === option.key}
                      onClick={() => setTypeFilter(option.key)}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${typeFilter === option.key ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-surface text-text hover:bg-secondary-50'}`}
                    >
                      {option.name}
                      <span className={`rounded-full px-2 text-xs ${typeFilter === option.key ? 'bg-white/20' : 'bg-secondary-100 text-text-muted'}`}>{option.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Room Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {visibleRooms.map((room) => {
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
                          <span className="text-xs text-text-muted">GHS {formatCurrency(basePrice)} × {nights} nights</span>
                          <span className={`text-xl font-bold ${isSelected ? 'text-primary-600' : 'text-text'}`}>
                            GHS {formatCurrency(roomTotal)}
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
                Select your arrival and departure dates above to see real-time room availability.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 🚨 SINGLE GLOBAL ACTION BAR                */}
      {/* ========================================== */}
      {hasSearched && availableRooms.length > 0 && (
        <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-surface border-t border-border shadow-2xl z-30 p-3 sm:p-4 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col sm:flex-row gap-3 sm:items-center justify-between backdrop-blur-md bg-surface/95">
          <div className="min-w-0 flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary-100 text-primary-600">
              <ShoppingCart size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-text">
                {selectedRooms.length} of {availableRooms.length} Rooms Selected
              </p>
              <p className="text-xs text-text-muted">
                Total Estimated: GHS {formatCurrency(selectedTotal)}
              </p>
            </div>
          </div>
          <button 
            onClick={handleProceedToBook}
            disabled={selectedRooms.length === 0}
            className={`w-full sm:w-auto justify-center px-4 sm:px-6 py-3 font-bold rounded-lg transition flex items-center gap-2 shadow-lg ${
              selectedRooms.length === 0 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-success-600 text-text-inverted hover:bg-success-700'
            }`}
          >
            Book selected rooms <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* Booking Modal                              */}
      {/* ========================================== */}
      <ReservationModal
        isOpen={isBookingModalOpen}
        onClose={() => { if (!savingBookingRef.current) setIsBookingModalOpen(false); }}
        onSubmit={handleBookingSubmit}
        isLoading={isSavingBooking}
        initialData={bookingInitialData}
      />
    </div>
  );
}
