import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAvailableRooms } from '../api/rooms';
import { useAuthStore } from '../store/authStore';
import { Link } from 'react-router-dom';
import { Search, Calendar, BedDouble, TrendingUp, AlertCircle, Check, ChevronRight, Users } from 'lucide-react';

export default function AvailabilityPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Set default dates (Today to Tomorrow)
  useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    setCheckInDate(today);
    setCheckOutDate(tomorrow);
  }, []);

  // Fetch available rooms when dates are set and user clicks search
  const { data, isLoading, error } = useQuery({
    queryKey: ['availability', checkInDate, checkOutDate, hasSearched],
    queryFn: () => getAvailableRooms(checkInDate, checkOutDate, propertyId).then(res => res.data.data),
    enabled: hasSearched && !!checkInDate && !!checkOutDate && !!propertyId,
  });

  const availableRooms = data || [];
  
  // Calculate stats
  const totalAvailable = availableRooms.length;
  const roomTypeCount = {};
  availableRooms.forEach(room => {
    const type = room.roomType?.typeName || 'Unknown';
    roomTypeCount[type] = (roomTypeCount[type] || 0) + 1;
  });

  const handleSearch = (e) => {
    e.preventDefault();
    if (checkInDate && checkOutDate) {
      setHasSearched(true);
    }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });

  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
          <Search size={24} className="text-primary-500" /> Availability Search
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Check which rooms are free for a date range — this uses the same overlap validation as bookings.
        </p>
      </div>

      {/* Search Form */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">
                <Calendar size={16} className="inline mr-1.5" />
                Check-in Date *
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
                <Calendar size={16} className="inline mr-1.5" />
                Check-out Date *
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
          </div>
        </form>
      </div>

      {/* Results Section */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success-50 text-success-600">
                <Check size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-semibold">Available Rooms</p>
                <p className="text-2xl font-bold text-text">{totalAvailable}</p>
              </div>
            </div>
            
            <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
                <BedDouble size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-semibold">Room Types</p>
                <p className="text-2xl font-bold text-text">{Object.keys(roomTypeCount).length}</p>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning-50 text-warning-600">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-semibold">Date Range</p>
                <p className="text-sm font-bold text-text">{formatDate(checkInDate)} → {formatDate(checkOutDate)}</p>
              </div>
            </div>
          </div>

          {/* Room Type Summary */}
          {Object.keys(roomTypeCount).length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-text mb-3">Availability by Room Type</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(roomTypeCount).map(([type, count]) => (
                  <div key={type} className="px-3 py-1.5 bg-secondary-50 border border-border rounded-lg text-sm">
                    <span className="font-semibold text-text">{type}:</span>
                    <span className="ml-1 text-primary-600 font-bold">{count} available</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Rooms List */}
          {isLoading ? (
            <div className="bg-surface border border-border rounded-xl p-12 text-center">
              <div className="animate-pulse flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-secondary-200 rounded-full"></div>
                <p className="text-text-muted">Searching available rooms...</p>
              </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableRooms.map((room) => (
                <div key={room.roomId} className="bg-surface border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
                        <BedDouble size={18} />
                      </div>
                      <div>
                        <h3 className="font-bold text-text">Room {room.roomNumber}</h3>
                        <p className="text-xs text-text-muted">Floor {room.floor}</p>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-success-50 text-success-700 text-xs font-bold rounded">
                      Available
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Users size={14} />
                      <span>{room.roomType?.maxOccupancy || 2} Guests</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <BedDouble size={14} />
                      <span>{room.roomType?.typeName}</span>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 mb-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-text-muted">Rate per night</span>
                      <span className="text-lg font-bold text-primary-600">
                        GH₵ {formatCurrency(room.roomType?.basePrice)}
                      </span>
                    </div>
                  </div>

                  <Link 
                    to={`/reservations/new?roomId=${room.roomId}&checkIn=${checkInDate}&checkOut=${checkOutDate}`}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition text-sm"
                  >
                    Book This Room <ChevronRight size={16} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!hasSearched && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
            <div className="p-4 rounded-full bg-secondary-50 text-secondary-600">
              <Search size={40} />
            </div>
            <div>
              <p className="text-lg font-bold text-text">Search for Available Rooms</p>
              <p className="text-sm text-text-muted mt-1">
                Select your check-in and check-out dates above to see which rooms are available.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}