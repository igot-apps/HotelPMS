import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { 
  Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane, 
  Dumbbell, Mountain, Loader2, Building2, Search, Calendar, 
  Users, X, SlidersHorizontal
} from 'lucide-react';

// Helper to map amenity strings to icons
const AmenityIcon = ({ name }) => {
  const lower = name?.toLowerCase() || '';
  if (lower.includes('wifi')) return <Wifi size={14} />;
  if (lower.includes('breakfast')) return <Coffee size={14} />;
  if (lower.includes('parking')) return <Car size={14} />;
  if (lower.includes('restaurant')) return <Utensils size={14} />;
  if (lower.includes('pool')) return <Waves size={14} />;
  if (lower.includes('shuttle') || lower.includes('airport')) return <Plane size={14} />;
  if (lower.includes('gym')) return <Dumbbell size={14} />;
  if (lower.includes('mountain') || lower.includes('view')) return <Mountain size={14} />;
  return <Star size={14} />;
};

export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Read filters from URL
  const [destination, setDestination] = useState(searchParams.get('search') || '');
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '');
  const [isSearching, setIsSearching] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Fetch hotels with filters
  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicDiscover', destination, checkIn, checkOut],
    queryFn: async () => {
      const params = {};
      if (destination) params.search = destination;
      if (checkIn) params.checkIn = checkIn;
      if (checkOut) params.checkOut = checkOut;
      const res = await api.get('/public/discover', { params });
      return res.data.data || [];
    },
  });

  const hotels = data || [];
  const hasActiveFilters = destination || checkIn || checkOut;

  // Handle search submission
  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('search', destination);
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    setSearchParams(params, { replace: true });
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 500);
  };

  const clearFilters = () => {
    setDestination('');
    setCheckIn('');
    setCheckOut('');
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 🌟 HERO SECTION WITH SEARCH */}
      <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700 overflow-hidden">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/2 translate-y-1/2 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs font-semibold mb-6">
            <Building2 size={14} />
            STAYFOLIO · INDEPENDENT HOTELS, ONE PLATFORM
          </div>
          
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4">
            Find your next stay,<br />
            <span className="bg-gradient-to-r from-warning-300 to-warning-500 bg-clip-text text-transparent">
              anywhere in Ghana.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-10">
            From Osu to the Northern Region — search real, independently‑run hotels and book direct confirmation in minutes.
          </p>

          {/* 🌟 SEARCH FORM */}
          <form onSubmit={handleSearch} className="max-w-5xl mx-auto">
            <div className="bg-surface rounded-2xl shadow-2xl p-3 md:p-4 border border-border">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3">
                {/* Destination */}
                <div className="md:col-span-5 relative">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1">Destination</label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="City, area, or hotel name"
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                    />
                  </div>
                </div>

                {/* Check-in */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1">Check-in</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      type="date"
                      value={checkIn}
                      min={today}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                    />
                  </div>
                </div>

                {/* Check-out */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1">Check-out</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input
                      type="date"
                      value={checkOut}
                      min={checkIn || tomorrow}
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                    />
                  </div>
                </div>

                {/* Search Button */}
                <div className="md:col-span-2 flex items-end">
                  <button
                    type="submit"
                    className="w-full h-[42px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30"
                  >
                    {isSearching ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <Search size={18} />
                        <span className="hidden sm:inline">Search</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 🌟 RESULTS SECTION */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-text flex items-center gap-2">
              <MapPin className="text-primary-600" />
              {hasActiveFilters ? 'Search Results' : 'Hotels Near You'}
            </h2>
            {!isLoading && (
              <p className="text-sm text-text-muted mt-1">
                {hotels.length} {hotels.length === 1 ? 'property' : 'properties'} found
                {destination && <> in "<span className="font-semibold text-text">{destination}</span>"</>}
              </p>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:bg-secondary-50 transition"
            >
              <X size={16} /> Clear Filters
            </button>
          )}
        </div>

        {/* Active Filter Pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-6">
            {destination && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full border border-primary-100">
                <MapPin size={12} /> {destination}
                <button onClick={() => setDestination('')} className="ml-1 hover:text-primary-900">
                  <X size={12} />
                </button>
              </span>
            )}
            {checkIn && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-full border border-secondary-100">
                <Calendar size={12} /> {new Date(checkIn).toLocaleDateString()}
                <button onClick={() => setCheckIn('')} className="ml-1 hover:text-secondary-900">
                  <X size={12} />
                </button>
              </span>
            )}
            {checkOut && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-full border border-secondary-100">
                <Calendar size={12} /> {new Date(checkOut).toLocaleDateString()}
                <button onClick={() => setCheckOut('')} className="ml-1 hover:text-secondary-900">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-primary-500" size={40} />
            <p className="text-text-muted font-semibold">Searching hotels...</p>
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Building2 size={48} className="mx-auto text-danger-500 mb-4" />
            <h3 className="text-xl font-bold text-text mb-2">Failed to load hotels</h3>
            <p className="text-text-muted">Please check your connection and try again.</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && hotels.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Search size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-text mb-2">No hotels match your search</h3>
            <p className="text-text-muted mb-6">
              {hasActiveFilters 
                ? 'Try adjusting your filters or search a different destination.' 
                : 'Check back later for new properties.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition"
              >
                <X size={16} /> Clear All Filters
              </button>
            )}
          </div>
        )}

        {/* Hotel Grid */}
        {!isLoading && !isError && hotels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {hotels.map((hotel, index) => (
              <Link 
                key={hotel.propertyCode || index} 
                to={`/public/${hotel.propertyCode}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`}
                className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col"
              >
                {/* Image */}
                <div className="relative h-56 overflow-hidden bg-secondary-100">
                  <img 
                    src={hotel.coverImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'} 
                    alt={hotel.propertyName || 'Hotel Property'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                  {hotel.rating && (
                    <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm border border-border">
                      <Star size={14} className="text-warning-500 fill-warning-500" />
                      <span className="text-sm font-bold text-text">{hotel.rating}</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="mb-3">
                    <h3 className="text-lg font-bold text-text group-hover:text-primary-600 transition-colors">
                      {hotel.propertyName || 'Unnamed Property'}
                    </h3>
                    {hotel.city && (
                      <p className="text-sm text-text-muted flex items-center gap-1 mt-1">
                        <MapPin size={14} /> {hotel.city}{hotel.country ? `, ${hotel.country}` : ''}
                      </p>
                    )}
                  </div>

                  {hotel.description && (
                    <p className="text-sm text-text-muted mb-4 line-clamp-2 flex-1">
                      {hotel.description}
                    </p>
                  )}

                  {/* Amenities */}
                  {hotel.amenities && hotel.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-md border border-secondary-100">
                          <AmenityIcon name={amenity} /> {amenity}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: Price */}
                  <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                    <div>
                      <p className="text-xs text-text-muted">Starting from</p>
                      <p className="text-xl font-black text-primary-600">
                        GHS {hotel.minPrice || '0'} <span className="text-sm font-normal text-text-muted">/ night</span>
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100 group-hover:bg-primary-600 group-hover:text-white transition">
                      View Rooms →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}