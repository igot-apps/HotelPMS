import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import {
  Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane,
  Dumbbell, Mountain, Loader2, Building2, Search, Calendar,
  X, Navigation, Crosshair, Map, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

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

// 🌟 BEAUTIFUL PAGINATION COMPONENT
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  // Generate page numbers with ellipsis logic
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5; // Show max 5 page buttons

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
      // Smooth scroll to top of results
      window.scrollTo({ top: 400, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-12 pt-8 border-t border-border">
      {/* Results Summary */}
      <p className="text-sm text-text-muted">
        Page <span className="font-bold text-text">{currentPage}</span> of{' '}
        <span className="font-bold text-text">{totalPages}</span>
      </p>

      {/* Pagination Controls */}
      <div className="flex items-center gap-1.5">
        {/* Previous Button */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-border bg-surface text-text hover:bg-secondary-50 hover:border-primary-200 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-border"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 py-2 text-text-muted text-sm">
                  ...
                </span>
              );
            }
            const isActive = page === currentPage;
            return (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`min-w-[40px] h-10 px-3 text-sm font-semibold rounded-lg transition ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                    : 'bg-surface border border-border text-text hover:bg-secondary-50 hover:border-primary-200'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-border bg-surface text-text hover:bg-secondary-50 hover:border-primary-200 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:border-border"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Search states
  const [destination, setDestination] = useState(searchParams.get('search') || '');
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '');
  const [isSearching, setIsSearching] = useState(false);
  
  // 🌟 NEW: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9; // 3x3 grid looks best

  // GPS states
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('checking');
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // 🌟 SILENT GPS CHECK ON PAGE LOAD
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
  }, []);

  // Manual retry when user clicks the banner button
  const requestLocation = () => {
    setLocationStatus('checking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus('granted');
        toast.success('Location enabled! Sorting by distance...');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 🌟 Fetch hotels WITH pagination
  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicDiscover', destination, checkIn, checkOut, userLocation, currentPage],
    queryFn: async () => {
      const params = {
        page: currentPage,
        limit: ITEMS_PER_PAGE,
      };
      if (destination) params.search = destination;
      if (checkIn) params.checkIn = checkIn;
      if (checkOut) params.checkOut = checkOut;
      if (userLocation) {
        params.userLat = userLocation.lat;
        params.userLng = userLocation.lng;
      }
      const res = await api.get('/public/discover', { params });
      // 🌟 Support both paginated response { data, total } AND legacy array response
      if (Array.isArray(res.data.data)) {
        return { hotels: res.data.data, total: res.data.data.length };
      }
      return res.data.data || { hotels: [], total: 0 };
    },
  });

  const hotels = data?.hotels || [];
  const totalHotels = data?.total || 0;
  const totalPages = Math.ceil(totalHotels / ITEMS_PER_PAGE);

  const hasActiveFilters = destination || checkIn || checkOut;

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('search', destination);
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    setSearchParams(params, { replace: true });
    // 🌟 Reset to page 1 when searching
    setCurrentPage(1);
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 500);
  };

  const clearFilters = () => {
    setDestination('');
    setCheckIn('');
    setCheckOut('');
    setSearchParams({}, { replace: true });
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 🌟 HERO SECTION WITH SEARCH */}
      <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700 overflow-hidden">
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
                <div className="md:col-span-5 relative">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1 text-left">Destination</label>
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
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1 text-left">Check-in</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input type="date" value={checkIn} min={today} onChange={(e) => setCheckIn(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-text-muted mb-1 px-1 text-left">Check-out</label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <input type="date" value={checkOut} min={checkIn || tomorrow} onChange={(e) => setCheckOut(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
                  </div>
                </div>
                <div className="md:col-span-2 flex items-end">
                  <button type="submit" className="w-full h-[42px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30">
                    {isSearching ? <Loader2 className="animate-spin" size={18} /> : <><Search size={18} /><span className="hidden sm:inline">Search</span></>}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* 🌟 RESULTS SECTION */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* 🌟 SMOOTH GPS STATUS BANNERS */}
        {locationStatus === 'checking' && (
          <div className="mb-6 flex items-center gap-2 text-text-muted bg-surface border border-border rounded-xl p-3 w-fit">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs font-semibold">Checking your location...</span>
          </div>
        )}
        {locationStatus === 'denied' && (
          <div className="mb-8 bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-secondary-100 rounded-full">
                <Map className="text-text-muted" size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">Find hotels closer to you</h3>
                <p className="text-xs text-text-muted">Enable location access to automatically sort results by distance.</p>
              </div>
            </div>
            <button
              onClick={requestLocation}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition shadow-sm whitespace-nowrap"
            >
              <Navigation size={16} /> Enable Location
            </button>
          </div>
        )}
        {locationStatus === 'granted' && (
          <div className="mb-8 flex items-center justify-between bg-success-50 border border-success-100 px-4 py-2.5 rounded-xl">
            <div className="flex items-center gap-2 text-success-700">
              <Crosshair size={16} />
              <span className="text-xs font-semibold">Sorted by distance from your location</span>
            </div>
            <button onClick={() => { setUserLocation(null); setLocationStatus('denied'); }} className="text-xs text-success-700 hover:text-success-900 underline">
              Turn off
            </button>
          </div>
        )}

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-text flex items-center gap-2">
              <MapPin className="text-primary-600" />
              {locationStatus === 'granted' ? 'Hotels Nearest to You' : 'Hotels Near You'}
            </h2>
            {!isLoading && (
              <p className="text-sm text-text-muted mt-1">
                {totalHotels} {totalHotels === 1 ? 'property' : 'properties'} found
                {destination && <> in "<span className="font-semibold text-text">{destination}</span>"</>}
                {totalPages > 1 && <span className="ml-2 text-primary-600 font-semibold">· Page {currentPage} of {totalPages}</span>}
              </p>
            )}
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:bg-secondary-50 transition">
              <X size={16} /> Clear Filters
            </button>
          )}
        </div>

        {/* Loading / Error / Empty States */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-primary-500" size={40} />
            <p className="text-text-muted font-semibold">Searching hotels...</p>
          </div>
        )}

        {!isLoading && !isError && hotels.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Search size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-text mb-2">No hotels match your search</h3>
            <p className="text-text-muted mb-6">Try adjusting your filters or search a different destination.</p>
          </div>
        )}

        {/* Hotel Grid */}
        {!isLoading && !isError && hotels.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {hotels.map((hotel, index) => (
                <Link
                  key={hotel.propertyCode || index}
                  to={`/public/${hotel.propertyCode}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`}
                  className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col"
                >
                  <div className="relative h-56 overflow-hidden bg-secondary-100">
                    <img
                      src={hotel.coverImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'}
                      alt={hotel.propertyName || 'Hotel Property'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'; }}
                    />
                    {hotel.rating && (
                      <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm border border-border">
                        <Star size={14} className="text-warning-500 fill-warning-500" />
                        <span className="text-sm font-bold text-text">{hotel.rating}</span>
                      </div>
                    )}
                  </div>
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
                      <p className="text-sm text-text-muted mb-4 line-clamp-2 flex-1">{hotel.description}</p>
                    )}
                    {hotel.amenities && hotel.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-md border border-secondary-100">
                            <AmenityIcon name={amenity} /> {amenity}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                      <div>
                        <p className="text-xs text-text-muted">Starting from</p>
                        <p className="text-xl font-black text-primary-600">
                          GHS {hotel.minPrice || '0'} <span className="text-sm font-normal text-text-muted">/ night</span>
                        </p>
                      </div>
                      {/* 🌟 FIXED: Added the missing closing quote here! */}
                      {hotel.distance && hotel.distance !== 'Nearby' && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                          locationStatus === 'granted' ? 'bg-primary-50 text-primary-700 border-primary-100' : 'bg-background text-text-muted border-border'
                        }`}>
                          {hotel.distance}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* 🌟 PAGINATION CONTROLS */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}