import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import {
  Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane,
  Dumbbell, Mountain, Loader2, Building2, Search, CheckCircle2,
  X, Navigation, Crosshair, Map, ChevronLeft, ChevronRight, ArrowUp, ChevronDown, CalendarDays
} from 'lucide-react';
import toast from 'react-hot-toast';
import PublicNavbar from '../components/public/PublicNavbar';
import { publicImageSrc } from '../lib/publicImages';
//import PublicPropertyCard from '../components/public/PublicPropertyCard';




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
      <div className="flex flex-wrap justify-center items-center gap-1.5">
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
        <div className="flex flex-wrap justify-center items-center gap-1">
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
  const resultsRef = useRef(null);
  const searchRef = useRef(null);
  const [showBackToSearch, setShowBackToSearch] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(() => !searchParams.has('search') && !searchParams.has('checkIn') && !searchParams.has('checkOut'));

  useEffect(() => {
    const updateVisibility = () => {
      setShowBackToSearch(Boolean(searchRef.current && searchRef.current.getBoundingClientRect().bottom < 80));
    };
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
    };
  }, []);
  
  // Search states
  const [destination, setDestination] = useState(searchParams.get('search') || '');
  const [debouncedDestination, setDebouncedDestination] = useState(searchParams.get('search') || '');
  const [checkIn, setCheckIn] = useState(searchParams.get('checkIn') || '');
  const [checkOut, setCheckOut] = useState(searchParams.get('checkOut') || '');
  const [availability, setAvailability] = useState(() => ['available', 'unavailable'].includes(searchParams.get('availability')) ? searchParams.get('availability') : 'all');
  const [isSearching, setIsSearching] = useState(false);
  
  // 🌟 NEW: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9; // 3x3 grid looks best

  // GPS states
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('checking');
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const hasInvalidDateRange = Boolean(checkIn && checkOut && checkOut <= checkIn);

  useEffect(() => { setCurrentPage(1); }, [checkIn, checkOut, availability]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDestination(destination.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [destination]);

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
    queryKey: ['publicDiscover', debouncedDestination, checkIn, checkOut, availability, userLocation, currentPage],
    enabled: !hasInvalidDateRange,
    queryFn: async () => {
      const params = {
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        availability,
      };
      if (debouncedDestination) params.search = debouncedDestination;
      if (checkIn && checkOut) {
        params.checkIn = checkIn;
        params.checkOut = checkOut;
      }
      if (userLocation) {
        params.userLat = userLocation.lat;
        params.userLng = userLocation.lng;
      }
      const res = await api.get('/public/discover', { params });
      // 🌟 Support both paginated response { data, total } AND legacy array response
      if (Array.isArray(res.data.data)) {
        return { hotels: res.data.data, total: res.data.data.length, amenities: [] };
      }
      return res.data.data || { hotels: [], total: 0 };
    },
  });

  const hotels = data?.hotels || [];
  const totalHotels = data?.total || 0;
  const totalPages = Math.ceil(totalHotels / ITEMS_PER_PAGE);

  const hasActiveFilters = destination || checkIn || checkOut || availability !== 'all';
  const changeAvailability = value => {
    setAvailability(value);
    setCurrentPage(1);
    setSearchParams(current => {
      const params = new URLSearchParams(current);
      if (value === 'all') params.delete('availability');
      else params.set('availability', value);
      return params;
    }, { replace: true });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (hasInvalidDateRange) {
      toast.error('Check-out must be after check-in.');
      return;
    }
    const params = new URLSearchParams();
    if (destination) params.set('search', destination);
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    if (availability !== 'all') params.set('availability', availability);
    setSearchParams(params, { replace: true });
    // 🌟 Reset to page 1 when searching
    setCurrentPage(1);
    setIsSearching(true);
    setIsSearchOpen(false);
    resultsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
    setTimeout(() => setIsSearching(false), 500);
  };

  const clearFilters = () => {
    setDestination('');
    setCheckIn('');
    setCheckOut('');
    setAvailability('all');
    setSearchParams({}, { replace: true });
    setCurrentPage(1);
  };

  const openSearch = () => {
    setIsSearchOpen(true);
    searchRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 🌟 ADD THE NAVBAR HERE */}
      <PublicNavbar />

      {/* 🌟 HERO SECTION WITH SEARCH */}
      <div className="relative isolate overflow-hidden bg-emerald-950">
        <picture aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 block">
          <source media="(max-width: 767px)" srcSet="/images/discovery-hero-mobile-480.webp 480w, /images/discovery-hero-mobile-768.webp 768w" sizes="100vw" />
          <img src="/images/discovery-hero-1280.webp" srcSet="/images/discovery-hero-1280.webp 1280w, /images/discovery-hero-1920.webp 1920w" sizes="100vw" width="1920" height="640" alt="" loading="eager" fetchPriority="high" decoding="async" className="h-full w-full object-cover object-center" />
        </picture>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-emerald-950/75 via-emerald-950/65 to-emerald-950/40 md:bg-[linear-gradient(90deg,rgba(2,44,34,0.35)_0%,rgba(2,44,34,0.76)_38%,rgba(2,44,34,0.70)_60%,rgba(2,44,34,0.18)_100%)]" />

        <div className="relative max-w-7xl mx-auto px-4 py-14 sm:py-16 md:py-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white text-xs font-semibold mb-5">
            <Building2 size={14} />
            HideOut24 · INDEPENDENT HOTELS, ONE PLATFORM
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-4 leading-[1.08]">
            Find your next stay,<br />
            <span className="text-white">
              anywhere in Ghana.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-8">
            Check which hotels have rooms for your dates before you travel. Compare local stays across Ghana and book directly.
          </p>

          {/* 🌟 SEARCH FORM */}
          <div ref={searchRef} className="max-w-6xl mx-auto scroll-mt-24 rounded-2xl border border-border bg-surface text-left shadow-2xl">
            <button
              type="button"
              aria-expanded={isSearchOpen}
              aria-controls="discover-search-fields"
              onClick={() => setIsSearchOpen(open => !open)}
              className="flex w-full flex-wrap items-center gap-3 rounded-2xl px-4 py-4 text-left text-text transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-300 sm:flex-nowrap sm:px-5"
            >
              <CalendarDays size={22} className="shrink-0 text-primary-600" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Search hotels</span>
                <span className="block text-sm text-text-muted">
                  {!isSearchOpen && !checkIn && !checkOut
                    ? 'Pick dates to book'
                    : [destination.trim(), checkIn && checkOut ? `${checkIn} – ${checkOut}` : checkIn ? `From ${checkIn}` : checkOut ? `Until ${checkOut}` : 'Pick dates to book'].filter(Boolean).join(' · ')}
                </span>
              </span>
              {checkIn && checkOut ? (
                <ChevronDown size={20} className={`shrink-0 text-primary-600 transition-transform motion-reduce:transition-none ${isSearchOpen ? 'rotate-180' : ''}`} />
              ) : (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm">
                  {isSearchOpen ? 'Hide search' : 'Pick dates'}
                  <ChevronDown size={17} className={`transition-transform motion-reduce:transition-none ${isSearchOpen ? 'rotate-180' : ''}`} />
                </span>
              )}
            </button>
            {isSearchOpen && <form id="discover-search-fields" onSubmit={handleSearch} className="border-t border-border p-3 sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3">
                <div className="md:col-span-12 lg:col-span-5 relative">
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
                <div className="md:col-span-6 lg:col-span-3 min-w-0">
                  <label htmlFor="discover-check-in" className="block text-xs font-bold text-text-muted mb-1 px-1 text-left">Check-in</label>
                  <div className="relative flex w-full min-w-0 max-w-full">
                    <input id="discover-check-in" aria-label="Check-in date" type="date" value={checkIn} min={today} onChange={(e) => setCheckIn(e.target.value)} className="responsive-date-input px-3 py-3 bg-background border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
                  </div>
                </div>
                <div className="md:col-span-6 lg:col-span-2 min-w-0">
                  <label htmlFor="discover-check-out" className="block text-xs font-bold text-text-muted mb-1 px-1 text-left">Check-out</label>
                  <div className="relative flex w-full min-w-0 max-w-full">
                    <input id="discover-check-out" aria-label="Check-out date" type="date" value={checkOut} min={checkIn || tomorrow} onChange={(e) => setCheckOut(e.target.value)} aria-invalid={hasInvalidDateRange} aria-describedby={hasInvalidDateRange ? 'discover-date-error' : undefined} className={`responsive-date-input px-3 py-3 bg-background border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition ${hasInvalidDateRange ? 'border-danger-500' : 'border-border'}`} />
                  </div>
                </div>
                <div className="md:col-span-12 lg:col-span-2 flex items-end">
                  <button type="submit" className="w-full min-h-[48px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                    {isSearching ? <Loader2 className="animate-spin" size={18} /> : <><Search size={18} /><span>Search</span></>}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-left text-xs text-text-muted">Availability updates as you choose your dates. Room availability can change until your booking is confirmed.</p>
              {hasInvalidDateRange && (
                <p id="discover-date-error" role="alert" className="mt-2 text-left text-sm font-medium text-danger-600">
                  Check-out must be after check-in.
                </p>
              )}
          </form>}
          </div>
        </div>
      </div>

      {/* 🌟 RESULTS SECTION */}
      <div ref={resultsRef} className="max-w-7xl mx-auto scroll-mt-20 px-4 py-12">
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
              {checkIn && checkOut ? 'Hotels for your dates' : locationStatus === 'granted' ? 'Hotels Nearest to You' : 'Explore hotels in Ghana'}
            </h2>
            {!isLoading && (
              <p className="text-sm text-text-muted mt-1">
                {totalHotels} {totalHotels === 1 ? 'property' : 'properties'} found
                {debouncedDestination && <> in "<span className="font-semibold text-text">{debouncedDestination}</span>"</>}
                {checkIn && checkOut && <> for {new Date(`${checkIn}T00:00:00`).toLocaleDateString()} – {new Date(`${checkOut}T00:00:00`).toLocaleDateString()}</>}
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

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-muted">{checkIn && checkOut ? 'Availability is shown for your selected dates.' : 'Availability is shown for tonight. Choose dates above for your stay.'}</p>
          <div className="w-full sm:w-auto">
            <label htmlFor="discovery-availability" className="mb-1 block text-xs font-semibold text-text-muted">Show hotels</label>
            <select id="discovery-availability" value={availability} onChange={event => changeAvailability(event.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-500 sm:min-w-56">
              <option value="all">All hotels</option>
              <option value="available">Rooms available</option>
              <option value="unavailable">No rooms available</option>
            </select>
          </div>
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
            <h3 className="text-xl font-bold text-text mb-2">{availability === 'available' ? 'No hotels with rooms available' : availability === 'unavailable' ? 'No unavailable hotels match your search' : 'No hotels match your search'}</h3>
            <p className="text-text-muted mb-6">Try different dates, another destination, or show all hotels.</p>
            {availability !== 'all' && <button onClick={() => changeAvailability('all')} className="mb-3 mr-3 inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold text-primary-700">Show all hotels</button>}
            {checkIn && checkOut && <button onClick={() => { setCheckIn(''); setCheckOut(''); setSearchParams((current) => { const params = new URLSearchParams(current); params.delete('checkIn'); params.delete('checkOut'); return params; }, { replace: true }); setCurrentPage(1); }} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition">Clear dates</button>}
          </div>
        )}

        {!isLoading && isError && (
          <div role="alert" className="text-center py-12 bg-surface border border-danger-200 rounded-2xl">
            <Search size={40} className="mx-auto text-danger-500 mb-3" />
            <h3 className="text-lg font-bold text-text mb-2">We couldn’t load hotel availability</h3>
            <p className="text-sm text-text-muted">Please try again in a moment.</p>
          </div>
        )}

        {/* Hotel Grid */}
        {!isLoading && !isError && hotels.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-7">
              {hotels.map((hotel, index) => (
                <article
                  key={hotel.propertyCode || index}
                  className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col motion-safe:animate-[card-enter_450ms_ease-out_both]"
                >
                  {(() => {
                    const photos = [...new Set([hotel.coverImage, ...(Array.isArray(hotel.galleryImages) ? hotel.galleryImages : [])].filter(Boolean))].slice(0, 3);
                    const fallback = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';
                    return (
                  <Link to={`/public/${hotel.propertyCode}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`} aria-label={`View ${hotel.propertyName || 'hotel'} photos and details`} className="relative grid h-56 grid-cols-3 gap-1 overflow-hidden bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                    <img src={publicImageSrc(photos[0]) || fallback} alt={`${hotel.propertyName || 'Hotel'} — main photo`} loading={index < 3 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" width="480" height="320" className={`${photos.length > 1 ? 'col-span-2 row-span-2' : 'col-span-3'} h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]`} onError={(e) => { e.currentTarget.src = fallback; }} />
                    {photos.slice(1).map((photo, photoIndex) => (
                      <img key={`${hotel.propertyCode}-photo-${photoIndex}`} src={publicImageSrc(photo)} alt={`${hotel.propertyName || 'Hotel'} — photo ${photoIndex + 2}`} loading="lazy" decoding="async" width="240" height="160" className="h-full min-h-0 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" onError={(e) => { e.currentTarget.src = fallback; }} />
                    ))}
                    {photos.length > 1 && <span className="absolute bottom-3 left-3 rounded-lg bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">{photos.length} photos · View gallery</span>}
                    {typeof hotel.availableRooms === 'number' && (
                      <div className={`absolute left-3 right-3 top-3 w-fit max-w-[calc(100%-1.5rem)] inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold shadow-sm ${hotel.availableRooms > 0 ? 'border-success-100 bg-success-50/95 text-success-700' : 'border-amber-200 bg-amber-50/95 text-amber-800'}`}>
                        {hotel.availableRooms > 0 ? <CheckCircle2 size={14} className="shrink-0" /> : <X size={14} className="shrink-0" />}
                        {hotel.availableRooms > 0 ? `${hotel.availableRooms} ${hotel.availableRooms === 1 ? 'room' : 'rooms'} available` : 'No rooms available'}{!(checkIn && checkOut) ? ' tonight' : ''}
                      </div>
                    )}
                  </Link>
                    );
                  })()}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="mb-3">
                      <Link to={`/public/${hotel.propertyCode}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`} className="text-lg font-bold text-text transition-colors hover:text-primary-600">
                        {hotel.propertyName || 'Unnamed Property'}
                      </Link>
                      {(hotel.area || hotel.city || hotel.region || hotel.ghanaPostAddress) && (
                        <p className="text-sm text-text-muted flex min-w-0 items-center gap-1 mt-1">
                          <MapPin size={14} className="shrink-0" />
                          <span className="min-w-0 truncate" title={[hotel.area, hotel.city, hotel.region, hotel.country].filter(Boolean).join(', ')}>
                            {[hotel.area, hotel.city, hotel.region].filter(Boolean).join(', ')}{hotel.country ? ` · ${hotel.country}` : ''}
                          </span>
                        </p>
                      )}
                      {hotel.ghanaPostAddress && (
                        <p className="text-xs text-text-muted mt-1 ml-5 truncate" title={`GhanaPost GPS: ${hotel.ghanaPostAddress}`}>
                          GhanaPost GPS: {hotel.ghanaPostAddress}
                        </p>
                      )}
                    </div>
                    {hotel.amenities && hotel.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-md border border-secondary-100">
                            <AmenityIcon name={amenity} /> {amenity}
                          </span>
                        ))}
                        {hotel.amenities.length > 3 && <span className="inline-flex items-center rounded-md border border-secondary-100 bg-secondary-50 px-2.5 py-1 text-xs font-semibold text-secondary-700" title={`${hotel.amenities.length - 3} more amenities`} aria-label={`${hotel.amenities.length - 3} more amenities`}>…</span>}
                      </div>
                    )}
                    <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                      <div>
                        <p className="text-xs text-text-muted">{hotel.availableRooms === 0 ? 'Usual starting rate' : 'Starting from'}</p>
                        <p className="text-xl font-black text-primary-600">
                          {hotel.minPrice != null ? <>GHS {hotel.minPrice} <span className="text-sm font-normal text-text-muted">/ night</span></> : <span className="text-sm font-semibold text-text-muted">Rates unavailable</span>}
                        </p>
                      </div>
                      {/* 🌟 FIXED: Added the missing closing quote here! */}
                      {hotel.distance && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                          locationStatus === 'granted' ? 'bg-primary-50 text-primary-700 border-primary-100' : 'bg-background text-text-muted border-border'
                        }`}>
                          {hotel.distance}
                        </span>
                      )}
                    </div>
                    {hotel.availableRooms === 0 ? (
                      <Link to={`/public/${hotel.propertyCode}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ''}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:underline">View hotel & try other dates <span aria-hidden="true" className="ml-1">→</span></Link>
                    ) : checkIn && checkOut ? (
                      <Link to={`/public/${hotel.propertyCode}?checkIn=${checkIn}&checkOut=${checkOut}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:underline">View rooms & book <span aria-hidden="true" className="ml-1">→</span></Link>
                    ) : (
                      <button type="button" onClick={openSearch} className="mt-3 inline-flex min-h-11 items-center text-left text-sm font-semibold text-primary-700 hover:underline">Pick dates to book at {hotel.propertyName || 'this hotel'} <span aria-hidden="true" className="ml-1">→</span></button>
                    )}
                  </div>
                </article>
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
      <button
        type="button"
        aria-label="Back to search"
        aria-hidden={!showBackToSearch}
        tabIndex={showBackToSearch ? 0 : -1}
        onClick={openSearch}
        className={`fixed bottom-6 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-white/20 bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-300 motion-reduce:transition-none sm:right-8 ${showBackToSearch ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'}`}
      >
        <ArrowUp size={19} /> Back to search
      </button>
    </div>
  );
}
