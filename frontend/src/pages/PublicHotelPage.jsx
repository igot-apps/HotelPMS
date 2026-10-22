import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar, MapPin, Phone, Mail, Tag, Loader2, ChevronRight, ChevronLeft,
  Wifi, Coffee, Car, Utensils, ShieldCheck, Sparkles, Users
} from 'lucide-react';
import api from '../lib/axios';
import PublicNavbar from '../components/public/PublicNavbar';

// Helper to fetch property data
const fetchProperty = async (propertyCode) => {
  const res = await api.get(`/public/${propertyCode}`);
  return res.data.data;
};

// Helper to fetch rooms with pagination
const fetchRooms = async ({ propertyCode, checkIn, checkOut, page }) => {
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

  // 🌟 Smart Date Initialization (Default to Today and Tomorrow)
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [checkIn, setCheckIn] = useState(today.toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState(tomorrow.toISOString().split('T')[0]);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 whenever dates change
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

  const handleSearch = (e) => {
    e.preventDefault();
    // React Query handles the refetch automatically when state changes
  };

  const handleBookNow = (roomTypeId) => {
    navigate(`/public/${propertyCode}/book/${roomTypeId}?checkIn=${checkIn}&checkOut=${checkOut}`);
  };

  // 🌟 Skeleton Loader for a premium feel
  if (isLoadingProp) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="max-w-5xl mx-auto px-4 py-12 space-y-8 animate-pulse">
          <div className="h-[400px] bg-secondary-100 rounded-2xl" />
          <div className="h-24 bg-surface rounded-xl border border-border" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="space-y-6">
              <div className="h-40 bg-surface rounded-xl border border-border" />
              <div className="h-32 bg-surface rounded-xl border border-border" />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="h-64 bg-surface rounded-xl border border-border" />
              <div className="h-64 bg-surface rounded-xl border border-border" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (propError || !property) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center p-6">
        <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mb-4">
          <MapPin size={32} className="text-danger-600" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Hotel Not Found</h1>
        <p className="text-text-muted max-w-md mb-6">This hotel may not exist, has been removed, or has temporarily disabled online bookings.</p>
        <button onClick={() => navigate('/discover')} className="px-6 py-2.5 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition">
          Discover Other Hotels
        </button>
      </div>
    );
  }

  // Format today's date for the min attribute on date inputs
  const minDate = today.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />

      {/* 1. Hero Section with Gradient Overlay */}
      <div className="relative h-[400px] w-full bg-secondary-900">
        {property.coverImage ? (
          <img src={property.coverImage} alt={property.propertyName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-600 to-secondary-900" />
        )}
        {/* Gradient Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-text-inverted">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 drop-shadow-lg">{property.propertyName}</h1>
          <div className="flex items-center gap-2 text-lg opacity-90 drop-shadow-md">
            <MapPin size={20} /> {property.city}, {property.country}
          </div>
        </div>
      </div>

      {/* 2. Floating Search Bar */}
      <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-10">
        <form onSubmit={handleSearch} className="bg-surface p-4 md:p-6 rounded-2xl shadow-xl border border-border flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-text-muted uppercase mb-1.5">Check In</label>
            <input 
              type="date" 
              value={checkIn} 
              onChange={(e) => setCheckIn(e.target.value)} 
              min={minDate}
              required 
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-text-muted uppercase mb-1.5">Check Out</label>
            <input 
              type="date" 
              value={checkOut} 
              onChange={(e) => setCheckOut(e.target.value)} 
              min={checkIn || minDate}
              required 
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
            />
          </div>
          <button type="submit" className="w-full md:w-auto px-8 py-3 bg-primary-600 text-text-inverted font-bold rounded-xl hover:bg-primary-700 transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20">
            <Calendar size={18} /> Check Availability
          </button>
        </form>
      </div>

      {/* 3. Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Hotel Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
            <h3 className="text-lg font-bold text-text mb-3 flex items-center gap-2">
              <Sparkles size={18} className="text-primary-600" /> About the Hotel
            </h3>
            <p className="text-sm text-text-muted leading-relaxed">
              {property.publicDescription || "Welcome to our beautiful property. We offer comfortable rooms and excellent service to make your stay memorable."}
            </p>
          </div>
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
            <h3 className="text-lg font-bold text-text mb-3 flex items-center gap-2">
              <Phone size={18} className="text-primary-600" /> Contact Us
            </h3>
            <div className="space-y-3 text-sm text-text-muted">
              {property.primaryPhone && (
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary-50 transition">
                  <Phone size={16} className="text-primary-600 flex-shrink-0" /> 
                  <span className="font-medium text-text">{property.primaryPhone}</span>
                </div>
              )}
              {property.primaryEmail && (
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary-50 transition">
                  <Mail size={16} className="text-primary-600 flex-shrink-0" /> 
                  <span className="font-medium text-text">{property.primaryEmail}</span>
                </div>
              )}
            </div>
          </div>
          {property.houseRules && (
            <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
              <h3 className="text-lg font-bold text-text mb-3 flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary-600" /> House Rules
              </h3>
              <p className="text-sm text-text-muted whitespace-pre-line leading-relaxed">{property.houseRules}</p>
            </div>
          )}
        </div>

        {/* Right Column: Available Room Types */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <h2 className="text-2xl font-bold text-text">Available Room Types</h2>
            <p className="text-sm text-text-muted font-medium bg-secondary-50 px-3 py-1 rounded-full border border-secondary-100 w-fit">
              {pagination.total} {pagination.total === 1 ? 'room type' : 'room types'} available
            </p>
          </div>

          {isLoadingRooms ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 bg-surface rounded-2xl border border-border animate-pulse" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="p-12 text-center bg-surface rounded-2xl border border-border border-dashed">
              <div className="w-16 h-16 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar size={32} className="text-text-muted" />
              </div>
              <p className="text-text font-semibold text-lg mb-1">No room types available for these dates.</p>
              <p className="text-sm text-text-muted">Please try adjusting your check-in or check-out dates.</p>
            </div>
          ) : (
            <>
          {/* 🌟 COMPACT Room Type Cards */}
          {rooms.map((room) => (
            <div key={room.roomTypeId} className="group bg-surface rounded-xl border border-border overflow-hidden hover:shadow-md hover:border-primary-300 transition-all duration-300">
              <div className="p-5 sm:p-6">
                {/* Clear "Room Type" Label */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold tracking-widest text-primary-600 uppercase bg-primary-50 px-2 py-0.5 rounded border border-primary-100">
                    Room Type
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-text group-hover:text-primary-600 transition-colors">
                      {room.typeName}
                    </h3>
                    <p className="text-sm text-text-muted mt-1 leading-relaxed line-clamp-2">
                      {room.description || "A comfortable and well-appointed room designed for your relaxation."}
                    </p>
                  </div>
                  {/* Compact Price Box */}
                  <div className="text-right sm:text-left bg-secondary-50/50 p-3 rounded-lg border border-secondary-100">
                    <p className="text-2xl font-black text-primary-600">GH₵ {parseFloat(room.basePrice).toFixed(2)}</p>
                    <p className="text-[10px] text-text-muted font-medium">per night</p>
                  </div>
                </div>

                {/* Amenities */}
                {room.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {room.amenities.slice(0, 4).map((link) => (
                      <span key={link.amenityId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-background text-text-muted border border-border">
                        <Tag size={10} className="text-primary-500" /> {link.amenity.name}
                      </span>
                    ))}
                    {room.amenities.length > 4 && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-background text-text-muted border border-border">
                        +{room.amenities.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Footer: Capacity, Availability & Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-border gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-text-muted font-medium text-xs">
                      <Users size={12} className="text-primary-500" />
                      Max {room.maxOccupancy} Guests
                    </span>
                    <span className="w-1 h-1 rounded-full bg-border hidden sm:block" />
                    {/* Professional Availability Badge */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                      room.availableRooms > 0 
                        ? 'bg-success-50 text-success-700 border-success-200' 
                        : 'bg-danger-50 text-danger-700 border-danger-200'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                      {room.availableRooms} {room.availableRooms === 1 ? 'room' : 'rooms'} available
                    </span>
                  </div>
                  <button 
                    onClick={() => handleBookNow(room.roomTypeId)}
                    disabled={room.availableRooms === 0}
                    className="w-full sm:w-auto px-6 py-2 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 shadow-sm shadow-primary-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {room.availableRooms > 0 ? (
                      <>Book Now <ChevronRight size={14} /></>
                    ) : (
                      <>Sold Out</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}

              {/* 🌟 PAGINATION CONTROLS */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 text-sm font-semibold text-text"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <span className="px-4 py-2 text-sm font-semibold text-text-muted bg-secondary-50 rounded-xl border border-secondary-100">
                    Page {currentPage} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={currentPage === pagination.totalPages}
                    className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 text-sm font-semibold text-text"
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