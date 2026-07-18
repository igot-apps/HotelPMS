import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, MapPin, Phone, Mail, Tag, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import api from '../lib/axios';

// Helper to fetch property data
const fetchProperty = async (propertyCode) => {
  const res = await api.get(`/public/${propertyCode}`);
  return res.data.data;
};

// 🌟 UPDATED: Helper to fetch rooms with pagination
const fetchRooms = async ({ propertyCode, checkIn, checkOut, page }) => {
  // 🛠️ CHANGED limit=6 to limit=2 for testing
  let url = `/public/${propertyCode}/room-types?page=${page}&limit=6`; 
  if (checkIn && checkOut) {
    url += `&checkIn=${checkIn}&checkOut=${checkOut}`;
  }
  const res = await api.get(url);
  return res.data; 
};

export default function PublicHotelPage() {
  const { propertyCode } = useParams();
  const navigate = useNavigate();
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date();
  dayAfter.setDate(dayAfter.getDate() + 2);

  const [checkIn, setCheckIn] = useState(tomorrow.toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState(dayAfter.toISOString().split('T')[0]);
  const [currentPage, setCurrentPage] = useState(1); // 🌟 NEW: Page state

  // 🌟 Reset to page 1 whenever dates change
  useEffect(() => {
    setCurrentPage(1);
  }, [checkIn, checkOut]);

  // Queries
  const { data: property, isLoading: isLoadingProp, error: propError } = useQuery({
    queryKey: ['publicProperty', propertyCode],
    queryFn: () => fetchProperty(propertyCode),
  });

  const { data: roomsResponse, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['publicRooms', propertyCode, checkIn, checkOut, currentPage],
    queryFn: () => fetchRooms({ propertyCode, checkIn, checkOut, page: currentPage }),
    enabled: !!property,
  });

  const rooms = roomsResponse?.data || [];
  const pagination = roomsResponse?.pagination || { page: 1, totalPages: 1, total: 0 };

  if (isLoadingProp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  if (propError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center p-6">
        <h1 className="text-2xl font-bold text-text mb-2">Hotel Not Found</h1>
        <p className="text-text-muted">This hotel may not exist or has disabled online bookings.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-primary-600 hover:underline">Go Home</button>
      </div>
    );
  }

  const handleSearch = (e) => {
    e.preventDefault();
    // React Query handles the refetch automatically when state changes
  };

    // 🌟 CHECKOUT GATE: Check if guest is logged in before booking
  const handleBookNow = (roomTypeId) => {
    const hasToken = localStorage.getItem('guestToken');
    if (!hasToken) {
      // Redirect to auth, remembering exactly where they wanted to go
      navigate(`/public/${propertyCode}/auth`, { 
        state: { from: `/public/${propertyCode}/book/${roomTypeId}?checkIn=${checkIn}&checkOut=${checkOut}` } 
      });
    } else {
      // They are logged in, take them straight to checkout
      navigate(`/public/${propertyCode}/book/${roomTypeId}?checkIn=${checkIn}&checkOut=${checkOut}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero Section */}
      <div className="relative h-[400px] w-full bg-secondary-900">
        {property.coverImage ? (
          <img src={property.coverImage} alt={property.propertyName} className="w-full h-full object-cover opacity-60" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-600 to-secondary-900 opacity-80" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-text-inverted">
          <h1 className="text-4xl md:text-5xl font-bold mb-2">{property.propertyName}</h1>
          <div className="flex items-center gap-2 text-lg opacity-90">
            <MapPin size={20} /> {property.city}, {property.country}
          </div>
        </div>
      </div>

      {/* 2. Search Bar */}
      <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-10">
        <form onSubmit={handleSearch} className="bg-surface p-4 md:p-6 rounded-xl shadow-xl border border-border flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-text-muted uppercase mb-1">Check In</label>
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-text-muted uppercase mb-1">Check Out</label>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
          </div>
          <button type="submit" className="w-full md:w-auto px-8 py-2.5 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2">
            <Calendar size={18} /> Check Availability
          </button>
        </form>
      </div>

      {/* 3. Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Hotel Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-surface p-6 rounded-xl border border-border">
            <h3 className="text-lg font-bold text-text mb-3">About the Hotel</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              {property.publicDescription || "Welcome to our beautiful property. We offer comfortable rooms and excellent service to make your stay memorable."}
            </p>
          </div>
          
          <div className="bg-surface p-6 rounded-xl border border-border">
            <h3 className="text-lg font-bold text-text mb-3">Contact Us</h3>
            <div className="space-y-3 text-sm text-text-muted">
              {property.primaryPhone && <div className="flex items-center gap-3"><Phone size={16} className="text-primary-600" /> {property.primaryPhone}</div>}
              {property.primaryEmail && <div className="flex items-center gap-3"><Mail size={16} className="text-primary-600" /> {property.primaryEmail}</div>}
            </div>
          </div>

          {property.houseRules && (
            <div className="bg-surface p-6 rounded-xl border border-border">
              <h3 className="text-lg font-bold text-text mb-3">House Rules</h3>
              <p className="text-sm text-text-muted whitespace-pre-line">{property.houseRules}</p>
            </div>
          )}
        </div>

        {/* Right Column: Available Rooms */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-text">Available Rooms</h2>
            <p className="text-sm text-text-muted">{pagination.total} room type(s) found</p>
          </div>
          
          {isLoadingRooms ? (
            <div className="p-12 text-center text-text-muted"><Loader2 className="animate-spin mx-auto mb-2" size={32} /> Searching rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="p-12 text-center bg-surface rounded-xl border border-border border-dashed">
              <p className="text-text-muted font-semibold">No rooms available for these dates.</p>
              <p className="text-sm text-text-muted mt-1">Please try different dates or contact the hotel directly.</p>
            </div>
          ) : (
            <>
              {/* Room Cards */}
              {rooms.map((room) => (
                <div key={room.roomTypeId} className="bg-surface rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-xl font-bold text-text">{room.typeName}</h3>
                        <p className="text-sm text-text-muted mt-1">{room.description || "A comfortable and well-appointed room."}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary-600">GH₵ {parseFloat(room.basePrice).toFixed(2)}</p>
                        <p className="text-xs text-text-muted">per night</p>
                      </div>
                    </div>

                    {room.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {room.amenities.map((link) => (
                          <span key={link.amenityId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary-100 text-secondary-700 border border-secondary-200">
                            <Tag size={12} /> {link.amenity.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-border">
                      <div className="text-sm text-text-muted">
                        Max {room.maxOccupancy} Guests • {room.availableRooms} room(s) left
                      </div>
                      <button 
                        onClick={() => handleBookNow(room.roomTypeId)}
                        className="px-6 py-2.5 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition flex items-center gap-2"
                      >
                        Book Now <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* 🌟 PAGINATION CONTROLS */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-6">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 text-sm font-semibold text-text"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  
                  <span className="px-4 py-2 text-sm font-semibold text-text-muted">
                    Page {currentPage} of {pagination.totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={currentPage === pagination.totalPages}
                    className="p-2 rounded-lg border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 text-sm font-semibold text-text"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}