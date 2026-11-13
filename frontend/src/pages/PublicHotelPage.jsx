import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar, MapPin, Phone, Mail, Tag, Loader2, ChevronRight, ChevronLeft, ChevronDown,
  Wifi, Coffee, Car, Utensils, ShieldCheck, Sparkles, Users, MessageCircle, ExternalLink
} from 'lucide-react';
import api from '../lib/axios';
import PublicNavbar from '../components/public/PublicNavbar';
import BackButton from '../components/ui/BackButton';
import { publicImageSrc } from '../lib/publicImages';

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

const toWhatsAppNumber = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `233${digits.slice(1)}` : digits.startsWith('233') ? digits : `233${digits}`;
};

export default function PublicHotelPage() {
  const { propertyCode } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const roomResultsRef = useRef(null);

// 🌟 Smart Date Initialization (Prevent past dates)
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
// Discovery, availability, and checkout share the same stay dates in the URL.
const checkIn = searchParams.get('checkIn') ?? today.toISOString().slice(0, 10);
const checkOut = searchParams.get('checkOut') ?? tomorrow.toISOString().slice(0, 10);
const updateStayDate = (field, value) => {
  setSearchParams(current => {
    const next = new URLSearchParams(current);
    next.set('checkIn', field === 'checkIn' ? value : checkIn);
    next.set('checkOut', field === 'checkOut' ? value : checkOut);
    return next;
  }, { replace: true });
};
const isStayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const [currentPage, setCurrentPage] = useState(1);
const [activePhoto, setActivePhoto] = useState(0);
const hasPickedDates = Boolean(searchParams.get('checkIn') && searchParams.get('checkOut'));
const hasInvalidDates = !isStayDate(checkIn) || !isStayDate(checkOut) || checkOut <= checkIn;
const earliestDeparture = isStayDate(checkIn) ? new Date(new Date(`${checkIn}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : tomorrow.toISOString().slice(0, 10);
const formatStayDate = value => isStayDate(value) ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Choose date';

  // Reset to page 1 whenever dates change
  useEffect(() => {
    setCurrentPage(1);
  }, [checkIn, checkOut]);

  // Queries
  const { data: property, isLoading: isLoadingProp, error: propError } = useQuery({
    queryKey: ['publicProperty', propertyCode],
    queryFn: () => fetchProperty(propertyCode),
  });

  // Start each hotel visit at its gallery, including after the loading screen.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [propertyCode, isLoadingProp]);

  const { data: roomsResponse, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['publicRooms', propertyCode, checkIn, checkOut, currentPage],
    queryFn: () => fetchRooms({ propertyCode, checkIn, checkOut, page: currentPage }),
    enabled: !!property && !hasInvalidDates,
  });

  const rooms = roomsResponse?.data || [];
  const pagination = roomsResponse?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleSearch = (e) => {
    e.preventDefault();
    if (hasInvalidDates) return;
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('checkIn', checkIn);
      next.set('checkOut', checkOut);
      return next;
    }, { replace: true });
    roomResultsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
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
  const propertyPhotos = [...new Set([property.coverImage, ...(Array.isArray(property.galleryImages) ? property.galleryImages : [])].filter(Boolean))].slice(0, 3);
  const selectedPhoto = propertyPhotos[activePhoto] || propertyPhotos[0];
  const googleMapUrl = property.latitude != null && property.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.latitude},${property.longitude}`)}`
    : null;
  const whatsappNumber = toWhatsAppNumber(property.primaryPhone);
  const contactHref = property.primaryPhone
    ? property.primaryPhoneWhatsappOnly
      ? (whatsappNumber ? `https://wa.me/${whatsappNumber}` : null)
      : `tel:${property.primaryPhone}`
    : property.primaryEmail
      ? `mailto:${property.primaryEmail}`
      : null;
  const contactLabel = property.primaryPhoneWhatsappOnly && property.primaryPhone
    ? 'WhatsApp hotel'
    : property.primaryPhone
      ? 'Call hotel'
      : 'Email hotel';

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />

      {/* 1. Hero Section with Gradient Overlay */}
      <div className="mx-auto max-w-7xl px-4 py-3 md:hidden"><BackButton fallback="/discover" label="Back to hotels" /></div>
      <section className="bg-secondary-900 p-3 sm:p-5">
        <div className={`mx-auto grid max-w-7xl gap-2 overflow-hidden rounded-2xl ${propertyPhotos.length > 1 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
          <div className={`relative h-[300px] bg-gradient-to-br from-primary-700 to-secondary-900 sm:h-[420px] ${propertyPhotos.length > 1 ? 'md:col-span-2' : ''}`}>
            {selectedPhoto && <img key={selectedPhoto} src={publicImageSrc(selectedPhoto)} alt={`${property.propertyName} — photo ${activePhoto + 1}`} loading="eager" fetchPriority="high" decoding="async" width="1280" height="900" className="h-full w-full object-cover motion-safe:animate-[photo-enter_350ms_ease-out_both]" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-8">
              <h1 className="mb-2 text-3xl font-bold drop-shadow-lg sm:text-5xl">{property.propertyName}</h1>
              <div className="flex items-center gap-2 text-base opacity-95 drop-shadow-md sm:text-lg"><MapPin size={19} /> {[property.area, property.city, property.region].filter(Boolean).join(', ') || property.country}</div>
              {contactHref && (
                <a href={contactHref} target={property.primaryPhoneWhatsappOnly && property.primaryPhone ? '_blank' : undefined} rel={property.primaryPhoneWhatsappOnly && property.primaryPhone ? 'noopener noreferrer' : undefined} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 shadow-lg transition hover:bg-primary-50">
                  {property.primaryPhoneWhatsappOnly && property.primaryPhone ? <MessageCircle size={17} /> : property.primaryPhone ? <Phone size={17} /> : <Mail size={17} />}
                  {contactLabel}
                </a>
              )}
            </div>
            {propertyPhotos.length > 1 && <span className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">{activePhoto + 1} / {propertyPhotos.length}</span>}
          </div>
          {propertyPhotos.length > 1 && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:grid-rows-2">
              {propertyPhotos.map((photo, index) => index !== activePhoto && (
                <button key={photo} type="button" onClick={() => setActivePhoto(index)} aria-label={`View property photo ${index + 1}`} className="group relative h-36 overflow-hidden bg-secondary-800 sm:h-[208px]">
                  <img src={publicImageSrc(photo)} alt={`${property.propertyName} — photo ${index + 1}`} loading="lazy" decoding="async" width="480" height="320" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-black/10 transition group-hover:bg-black/0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. Floating Search Bar */}
      <div className="relative z-10 mx-auto -mt-8 max-w-5xl px-4">
        <details key={propertyCode} className="group min-w-0 rounded-2xl border border-border bg-surface shadow-xl">
          <summary className="flex min-h-20 cursor-pointer list-none flex-wrap items-center gap-3 rounded-2xl px-4 py-4 text-text transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-300 sm:flex-nowrap sm:px-5 [&::-webkit-details-marker]:hidden">
            <Calendar size={22} className="shrink-0 text-primary-600" />
            <span className="min-w-0 flex-1"><span className="block font-bold">Check availability</span><span className="block text-sm text-text-muted">{hasPickedDates ? `${formatStayDate(checkIn)} – ${formatStayDate(checkOut)}` : 'Pick dates to book'}</span></span>
            {hasPickedDates ? <ChevronDown size={20} className="shrink-0 text-primary-600 transition-transform motion-reduce:transition-none group-open:rotate-180" /> : <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm"><span className="group-open:hidden">Pick dates</span><span className="hidden group-open:inline">Hide dates</span><ChevronDown size={17} className="transition-transform motion-reduce:transition-none group-open:rotate-180" /></span>}
          </summary>
        <form onSubmit={handleSearch} className="grid min-w-0 grid-cols-1 gap-4 border-t border-border p-4 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6">
          <div className="min-w-0 w-full">
            <label htmlFor="hotel-check-in" className="block text-xs font-bold text-text-muted uppercase mb-1.5">Check In</label>
            <div className="flex w-full min-w-0 max-w-full">
            <input 
              id="hotel-check-in"
              type="date" 
              value={checkIn} 
              onChange={(e) => updateStayDate('checkIn', e.target.value)}
              min={minDate}
              required 
              className="responsive-date-input px-4 py-3 bg-background border border-border rounded-xl text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
            </div>
          </div>
          <div className="min-w-0 w-full">
            <label htmlFor="hotel-check-out" className="block text-xs font-bold text-text-muted uppercase mb-1.5">Check Out</label>
            <div className="flex w-full min-w-0 max-w-full">
            <input 
              id="hotel-check-out"
              type="date" 
              value={checkOut} 
              onChange={(e) => updateStayDate('checkOut', e.target.value)}
              min={earliestDeparture}
              aria-invalid={hasInvalidDates}
              aria-describedby={hasInvalidDates ? 'hotel-date-error' : undefined}
              required 
              className="responsive-date-input px-4 py-3 bg-background border border-border rounded-xl text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
            />
            </div>
          </div>
          <button type="submit" className="w-full md:w-auto px-8 py-3 bg-primary-600 text-text-inverted font-bold rounded-xl hover:bg-primary-700 transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20">
            <Calendar size={18} /> Check Availability
          </button>
          {hasInvalidDates && <p id="hotel-date-error" role="alert" className="text-sm text-danger-600 md:col-span-3">Choose check-in and check-out dates. Check-out must be after check-in.</p>}
        </form>
        </details>
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
          {googleMapUrl && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-text"><MapPin size={18} className="text-primary-600" /> Hotel location</h3>
              <a href={googleMapUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${property.propertyName} on Google Maps`} className="group flex min-h-12 items-center justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-primary-800 transition hover:border-primary-300 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                <span className="min-w-0 font-bold">View hotel on Google Maps</span>
                <ExternalLink size={18} className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </a>
              <p className="mt-2 text-xs text-text-muted">Get directions to the hotel’s saved location.</p>
            </div>
          )}
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
            <h3 className="text-lg font-bold text-text mb-3 flex items-center gap-2">
              <Phone size={18} className="text-primary-600" /> Contact Us
            </h3>
            <div className="space-y-3 text-sm text-text-muted">
              {property.primaryPhone && (
                property.primaryPhoneWhatsappOnly ? (
                  <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg bg-green-50 p-3 text-green-800 transition hover:bg-green-100">
                    <MessageCircle size={18} className="flex-shrink-0" />
                    <span><span className="block font-semibold">WhatsApp only</span><span className="text-xs">{property.primaryPhone}</span></span>
                  </a>
                ) : (
                  <a href={`tel:${property.primaryPhone}`} className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary-50">
                    <Phone size={16} className="flex-shrink-0 text-primary-600" />
                    <span className="font-medium text-text">{property.primaryPhone}</span>
                  </a>
                )
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
        <div ref={roomResultsRef} className="lg:col-span-2 space-y-6 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <h2 className="text-2xl font-bold text-text">{hasPickedDates ? 'Rooms available for your date' : 'Room types'}</h2>
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
          {/* Room type cards */}
          {rooms.map((room) => (
            <article key={room.roomTypeId} className="group overflow-hidden rounded-2xl border border-primary-100 bg-surface shadow-sm transition-shadow duration-300 hover:shadow-lg">
              <div className="grid lg:grid-cols-[minmax(0,1.65fr)_minmax(240px,1fr)]">
                <div className="flex min-w-0 flex-col p-5 sm:p-7">
                  <span className="mb-4 w-fit rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary-700">
                    Room Type
                  </span>
                  <h3 className="text-2xl font-bold text-text transition-colors group-hover:text-primary-700 sm:text-3xl">{room.typeName}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted sm:text-base">
                    {room.description || 'A comfortable and well-appointed room designed for your relaxation.'}
                  </p>

                {room.amenities?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
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

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4 sm:mt-auto sm:pt-5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted">
                      <Users size={17} className="text-primary-600" />
                      Max {room.maxOccupancy} {room.maxOccupancy === 1 ? 'guest' : 'guests'}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
                      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                      {room.availableRooms} {room.availableRooms === 1 ? 'room' : 'rooms'} available
                    </span>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-6 border-t border-primary-100 bg-primary-50/50 p-5 sm:p-7 lg:border-l lg:border-t-0">
                <div>
                  <p className="text-3xl font-black tracking-tight text-primary-700 sm:text-4xl">GH₵ {parseFloat(room.basePrice).toFixed(2)}</p>
                  <p className="mt-1 text-sm font-medium text-text-muted">per night</p>
                </div>
                <div className="border-t border-primary-100 pt-5">
                  <button
                    onClick={() => handleBookNow(room.roomTypeId)}
                    disabled={room.availableRooms === 0}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 font-bold text-text-inverted shadow-sm transition hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {room.availableRooms > 0 ? (
                      <>Book Now <ChevronRight size={18} /></>
                    ) : (
                      <>Sold Out</>
                    )}
                  </button>
                </div>
              </div>
              </div>
            </article>
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
