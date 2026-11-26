import { useState, useEffect } from 'react';
import { X, Loader2, Globe, Save, Smartphone, MapPin, LocateFixed, ImagePlus, Star, Trash2, MessageCircle, Clock3, Upload } from 'lucide-react';
import { isWithinGhanaBounds, googleMapsUrl } from '../../utils/ghanaCoordinates';

const MAX_GALLERY_IMAGES = 3;
const MAX_COMPRESSED_IMAGE_BYTES = 350 * 1024;
const GHANA_REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
];

function getInitialGallery(property) {
  const existing = [property?.coverImage, ...(Array.isArray(property?.galleryImages) ? property.galleryImages : [])];
  return [...new Set(existing.filter((image) => typeof image === 'string' && image.trim()))].slice(0, MAX_GALLERY_IMAGES);
}

function compressPropertyImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} is not an image.`));
    if (file.size > 15 * 1024 * 1024) return reject(new Error(`${file.name} is larger than 15 MB. Choose a smaller photo.`));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(`Could not open ${file.name}.`));
      image.onload = async () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);

        for (let quality = 0.82; quality >= 0.48; quality -= 0.08) {
          const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality));
          if (blob && blob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
            const compressedReader = new FileReader();
            compressedReader.onerror = () => reject(new Error(`Could not prepare ${file.name}.`));
            compressedReader.onload = () => resolve(compressedReader.result);
            compressedReader.readAsDataURL(blob);
            return;
          }
        }
        reject(new Error(`${file.name} could not be compressed below 350 KB. Choose a smaller photo.`));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PropertyModal({ isOpen, onClose, onSubmit, isLoading, initialData }) {
  const [formData, setFormData] = useState({
    propertyName: '', propertyCode: '', businessName: '', legalName: '', propertyType: 'Hotel', address: '', area: '', city: '', region: '', country: 'Ghana',
    latitude: '', longitude: '', checkInTime: '14:00', checkOutTime: '11:00',
    primaryEmail: '', primaryPhone: '', primaryPhoneWhatsappOnly: false, coverImage: '', galleryImages: [], publicDescription: '',
    cancellationPolicy: '', houseRules: '', taxPercentage: 0.00, isOnlineBookingEnabled: false, isNonRefundable: true, allowEarlyDepartureChargeReduction: false, earlyDepartureChargeReductionPenaltyPercent: 0,
    moolreUsername: '', moolrePublicKey: '', moolreAccountNumber: '', moolreWebhookSecret: '',
  });
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [penaltyError, setPenaltyError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [isReplacingMoolreKeys, setIsReplacingMoolreKeys] = useState(false);

  useEffect(() => {
    setIsReplacingMoolreKeys(false);
    if (initialData) {
      setFormData({
        propertyName: initialData.propertyName || '',
        propertyCode: initialData.propertyCode || '',
        businessName: initialData.businessName || '',
        legalName: initialData.legalName || '',
        propertyType: initialData.propertyType || 'Hotel',
        address: initialData.address || '',
        area: initialData.area || '',
        city: initialData.city || '',
        region: initialData.region || '',
        country: initialData.country || 'Ghana',
        latitude: initialData.latitude ?? '',
        longitude: initialData.longitude ?? '',
        checkInTime: initialData.checkInTime || '14:00',
        checkOutTime: initialData.checkOutTime || '11:00',
        primaryEmail: initialData.primaryEmail || '',
        primaryPhone: initialData.primaryPhone || '',
        primaryPhoneWhatsappOnly: initialData.primaryPhoneWhatsappOnly || false,
        coverImage: initialData.coverImage || '',
        galleryImages: getInitialGallery(initialData),
        publicDescription: initialData.publicDescription || '',
        cancellationPolicy: initialData.cancellationPolicy || '',
        houseRules: initialData.houseRules || '',
        taxPercentage: initialData.taxPercentage ? parseFloat(initialData.taxPercentage) : 0.00,
        isOnlineBookingEnabled: initialData.isOnlineBookingEnabled || false,
        isNonRefundable: initialData.isNonRefundable !== false,
        allowEarlyDepartureChargeReduction: initialData.allowEarlyDepartureChargeReduction === true,
        earlyDepartureChargeReductionPenaltyPercent: initialData.earlyDepartureChargeReductionPenaltyPercent != null ? parseFloat(initialData.earlyDepartureChargeReductionPenaltyPercent) : 0,
        moolreUsername: '', moolrePublicKey: '', moolreAccountNumber: '', moolreWebhookSecret: '',
      });
    } else {
      setFormData({
        propertyName: '', propertyCode: '', businessName: '', legalName: '', propertyType: 'Hotel', address: '', area: '', city: '', region: '', country: 'Ghana',
        latitude: '', longitude: '', checkInTime: '14:00', checkOutTime: '11:00',
        primaryEmail: '', primaryPhone: '', primaryPhoneWhatsappOnly: false, coverImage: '', galleryImages: [], publicDescription: '',
        cancellationPolicy: '', houseRules: '', taxPercentage: 0.00, isOnlineBookingEnabled: false, isNonRefundable: true, allowEarlyDepartureChargeReduction: false, earlyDepartureChargeReductionPenaltyPercent: 0,
        moolreUsername: '', moolrePublicKey: '', moolreAccountNumber: '', moolreWebhookSecret: '',
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleImageFiles = async (files) => {
    const availableSlots = MAX_GALLERY_IMAGES - formData.galleryImages.length;
    if (availableSlots <= 0) {
      setImageError('Your gallery has three photos. Remove one before adding another.');
      return;
    }
    const selectedFiles = Array.from(files).slice(0, availableSlots);
    if (!selectedFiles.length) return;
    setImageLoading(true);
    setImageError('');
    const uploaded = [];
    try {
      for (const file of selectedFiles) uploaded.push(await compressPropertyImage(file));
      setFormData((current) => ({ ...current, galleryImages: [...current.galleryImages, ...uploaded].slice(0, MAX_GALLERY_IMAGES) }));
    } catch (error) {
      setImageError(error.message || 'Could not add that photo. Please try another image.');
    } finally {
      setImageLoading(false);
    }
  };

  const removeGalleryImage = (image) => {
    setFormData((current) => {
      const galleryImages = current.galleryImages.filter((item) => item !== image);
      return { ...current, galleryImages, coverImage: current.coverImage === image ? (galleryImages[0] || '') : current.coverImage };
    });
  };

  const setCoverImage = (image) => setFormData((current) => ({ ...current, coverImage: image }));

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Location is not available in this browser.');
      return;
    }
    setLocationLoading(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isWithinGhanaBounds(coords.latitude, coords.longitude)) {
          setLocationError('This location is outside Ghana. Select the hotel’s location on Google Maps.');
          setLocationLoading(false);
          return;
        }
        setFormData((current) => ({ ...current, latitude: coords.latitude, longitude: coords.longitude }));
        setLocationLoading(false);
      },
      () => {
        setLocationError('Could not get your location. Allow location access and try again.');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((formData.latitude !== '' || formData.longitude !== '' || !initialData) && (formData.latitude === '' || formData.longitude === '' || !isWithinGhanaBounds(Number(formData.latitude), Number(formData.longitude)))) {
      setLocationError('Enter both hotel coordinates within Ghana, then check the pin on Google Maps.');
      return;
    }
    setLocationError('');
    const penalty = Number(formData.earlyDepartureChargeReductionPenaltyPercent);
    if (formData.earlyDepartureChargeReductionPenaltyPercent === '' || !Number.isFinite(penalty) || penalty < 0 || penalty > 100) {
      setPenaltyError('Enter an early-departure penalty between 0 and 100%.');
      return;
    }
    setPenaltyError('');
    const galleryArray = formData.galleryImages.filter((image) => image !== formData.coverImage);

    // Keys are sent only when the user explicitly chose to replace them; the server never returns them.
    const { moolreUsername, moolrePublicKey, moolreAccountNumber, moolreWebhookSecret, ...propertyFields } = formData;
    const shouldUpdateMoolreKeys = isReplacingMoolreKeys && moolreUsername.trim() && moolrePublicKey.trim() && moolreAccountNumber.trim();
    const payload = {
      ...propertyFields,
      galleryImages: galleryArray,
      coverImage: formData.coverImage || formData.galleryImages[0] || '',
      taxPercentage: parseFloat(formData.taxPercentage) || 0.00,
      earlyDepartureChargeReductionPenaltyPercent: Math.round(penalty * 100) / 100,
      latitude: formData.latitude === '' ? null : Number(formData.latitude),
      longitude: formData.longitude === '' ? null : Number(formData.longitude),
      // 🌟 Conditionally include the key
      ...(shouldUpdateMoolreKeys && { moolreUsername: moolreUsername.trim(), moolrePublicKey: moolrePublicKey.trim(), moolreAccountNumber: moolreAccountNumber.trim(), moolreWebhookSecret: moolreWebhookSecret.trim(), replaceMoolreKeys: true }),
    };

    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border p-5 sm:p-6">
          <div><h2 className="text-xl font-bold text-text">{initialData ? 'Edit Property Settings' : 'Add New Property'}</h2><p className="mt-1 text-sm text-text-muted">Work through each section. All settings remain available below.</p></div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
      {/* Basic Info */}
          <section className="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
            <h3 className="text-base font-bold text-text">Property details</h3>
            <p className="mb-5 mt-1 text-sm text-text-muted">Identity, address, map location and guest contact details.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Identity</div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Name *</label>
                <input type="text" name="propertyName" value={formData.propertyName} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property Code *</label>
                <input type="text" name="propertyCode" value={formData.propertyCode} onChange={handleChange} required disabled={!!initialData} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Business / trading name</label>
                <input type="text" name="businessName" value={formData.businessName} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Legal name</label>
                <input type="text" name="legalName" value={formData.legalName} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Property type</label>
                <select name="propertyType" value={formData.propertyType} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                  {['Hotel', 'Guest House', 'Lodge', 'Resort', 'Hostel', 'Apartment'].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Country</label>
                <input type="text" name="country" value={formData.country} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="md:col-span-2 mt-2 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Address and map location</div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-text mb-1.5">Street address / directions</label>
                <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Area / neighbourhood</label>
                <input type="text" name="area" value={formData.area} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">City / town</label>
                <input type="text" name="city" value={formData.city} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Region</label>
                <select name="region" value={formData.region} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                  <option value="">Select a region</option>
                  {formData.region && !GHANA_REGIONS.includes(formData.region) && <option value={formData.region}>{formData.region} (saved value)</option>}
                  {GHANA_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </div>
              <div className="md:col-span-2 rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text flex items-center gap-2"><MapPin size={16} className="text-primary-600" /> Map location</p>
                    <p className="text-xs text-text-muted mt-1">At the hotel, capture your location. Elsewhere, find the exact hotel pin on Google Maps and enter its coordinates.</p>
                  </div>
                  <button type="button" onClick={captureLocation} disabled={locationLoading} className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-secondary-50 disabled:opacity-60"><LocateFixed size={16} />{locationLoading ? 'Getting location…' : 'Use current location'}</button>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label htmlFor="property-latitude" className="block text-xs font-semibold text-text mb-1">Latitude</label><input id="property-latitude" type="number" step="any" name="latitude" value={formData.latitude} onChange={handleChange} placeholder="e.g. 5.6037" className="w-full rounded-lg border border-border bg-surface px-3 py-2.5" /></div>
                  <div><label htmlFor="property-longitude" className="block text-xs font-semibold text-text mb-1">Longitude</label><input id="property-longitude" type="number" step="any" name="longitude" value={formData.longitude} onChange={handleChange} placeholder="e.g. -0.1870" className="w-full rounded-lg border border-border bg-surface px-3 py-2.5" /></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm"><a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-700 underline">Find hotel on Google Maps ↗</a>{formData.latitude && formData.longitude && isWithinGhanaBounds(Number(formData.latitude), Number(formData.longitude)) && <a href={googleMapsUrl(formData.latitude, formData.longitude)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-700 underline">Check saved pin ↗</a>}</div>
                {locationError && <p role="alert" className="text-xs text-danger-600 mt-2">{locationError}</p>}
              </div>
              <div className="md:col-span-2 mt-2 border-b border-border pb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Guest contact and operating times</div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Primary contact phone</label>
                <input type="tel" name="primaryPhone" value={formData.primaryPhone} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                <label className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer">
                  <input type="checkbox" name="primaryPhoneWhatsappOnly" checked={formData.primaryPhoneWhatsappOnly} onChange={handleChange} className="mt-0.5 accent-primary-600" />
                  <span><span className="flex items-center gap-1.5 text-sm font-medium text-text"><MessageCircle size={15} className="text-green-600" /> WhatsApp only</span><span className="mt-0.5 block text-xs text-text-muted">Guests will message this number instead of calling it.</span></span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Primary contact email</label>
                <input type="email" name="primaryEmail" value={formData.primaryEmail} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="md:col-span-2 rounded-xl border border-border bg-background p-4">
                <div className="mb-4 flex items-center gap-2"><Clock3 size={17} className="text-primary-600" /><div><p className="text-sm font-semibold text-text">Guest arrival and departure times</p><p className="text-xs text-text-muted">Times are local to the hotel (Ghana time, GMT).</p></div></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-semibold text-text mb-1.5">Check-in begins</label><input type="time" name="checkInTime" value={formData.checkInTime} onChange={handleChange} className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" /><p className="mt-1.5 text-xs leading-relaxed text-text-muted">The earliest time a guest may enter their room on arrival day.</p></div>
                  <div><label className="block text-sm font-semibold text-text mb-1.5">Check-out by</label><input type="time" name="checkOutTime" value={formData.checkOutTime} onChange={handleChange} className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" /><p className="mt-1.5 text-xs leading-relaxed text-text-muted">The time guests should leave their room on departure day.</p></div>
                </div>
              </div>
            </div>
          </section>

          {/* Public Website Settings */}
          <section className="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-text">
              <Globe size={17} className="text-primary-600" /> Booking rules
            </h3>
            <p className="mb-5 mt-1 text-sm text-text-muted">Control public bookings and what happens when a guest cancels.</p>
            <div className="grid gap-4 md:grid-cols-2">
            
            {/* Online Booking Toggle */}
            <div className="flex items-start justify-between gap-4 p-4 bg-primary-50 border border-primary-100 rounded-lg">
              <div className="flex-1">
                <label className="text-sm font-bold text-text">Accept Online Bookings</label>
                <p className="text-xs text-text-muted mt-0.5">Allow guests to discover your hotel and book available rooms on the public website.</p>
                {formData.isOnlineBookingEnabled && (
                  <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    If you have zero bookable rooms, your hotel will not appear on the public discovery page, even with online bookings enabled.
                  </p>
                )}
              </div>
              <label className="relative inline-flex shrink-0 min-h-11 items-center cursor-pointer">
                <input type="checkbox" name="isOnlineBookingEnabled" checked={formData.isOnlineBookingEnabled} onChange={handleChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>

            {/* Refund policy */}
            <div className="flex items-start justify-between gap-4 p-4 bg-warning-50 border border-warning-100 rounded-lg">
              <div className="flex-1">
                <label htmlFor="isNonRefundable" className="text-sm font-bold text-text">Non-refundable bookings</label>
                <p className="text-xs text-text-muted mt-0.5">
                  {formData.isNonRefundable
                    ? 'On: when a booking is cancelled, the hotel keeps money paid at the hotel. Staff can still refund it as a recorded exception. Online payments are always non-refundable.'
                    : 'Off: when a booking is cancelled, money paid at the hotel becomes a refund due to the guest. Online payments are always non-refundable.'}
                </p>
              </div>
              <label className="relative inline-flex shrink-0 min-h-11 items-center cursor-pointer">
                <input id="isNonRefundable" type="checkbox" name="isNonRefundable" checked={formData.isNonRefundable} onChange={handleChange} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 md:col-span-2">
              <div className="flex-1">
                <label htmlFor="allowEarlyDepartureChargeReduction" className="text-sm font-bold text-text">Reduce charges when a guest leaves early</label>
                <p className="mt-0.5 text-xs text-text-muted">
                  {formData.allowEarlyDepartureChargeReduction
                    ? (Number(formData.earlyDepartureChargeReductionPenaltyPercent) > 0
                      ? `On: staff may shorten an active stay. The hotel keeps ${Number(formData.earlyDepartureChargeReductionPenaltyPercent)}% of unused nights; the rest is removed.`
                      : 'On: staff may shorten an active stay and remove charges for unused nights.')
                    : 'Off: guests may check out early, but the original agreed booking charges remain.'}
                </p>
                {formData.allowEarlyDepartureChargeReduction && (
                  <div className="mt-3">
                    <label htmlFor="earlyDepartureChargeReductionPenaltyPercent" className="text-xs font-semibold text-text">Early-departure penalty (%)</label>
                    <p className="text-xs text-text-muted">Share of the unused nights' charges the hotel keeps. 0% removes them in full; 100% keeps them all.</p>
                    <input id="earlyDepartureChargeReductionPenaltyPercent" type="number" name="earlyDepartureChargeReductionPenaltyPercent" min="0" max="100" step="0.01" required value={formData.earlyDepartureChargeReductionPenaltyPercent} onChange={(e) => { setPenaltyError(''); handleChange(e); }} className="mt-1 w-32 px-3 py-2 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                    {penaltyError && <p role="alert" className="mt-1 text-xs text-danger-600">{penaltyError}</p>}
                  </div>
                )}
              </div>
              <label className="relative inline-flex min-h-11 shrink-0 cursor-pointer items-center">
                <input id="allowEarlyDepartureChargeReduction" type="checkbox" name="allowEarlyDepartureChargeReduction" checked={formData.allowEarlyDepartureChargeReduction} onChange={handleChange} className="peer sr-only" />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-primary-300"></div>
              </label>
            </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-text"><Globe size={17} className="text-primary-600" /> Public website profile</h3>
            <p className="mb-5 mt-1 text-sm text-text-muted">Choose the photos and description guests see online.</p>
            {/* Property image gallery */}
            <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
              <div className="flex flex-col gap-3 border-b border-emerald-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h4 className="flex items-center gap-2 font-semibold text-text"><ImagePlus size={18} className="text-primary-600" /> Show guests your property</h4><p className="mt-1 text-sm text-text-muted">Add up to 3 photos of your rooms, facilities, or surroundings.</p></div>
                <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">{formData.galleryImages.length} / {MAX_GALLERY_IMAGES} photos</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {formData.galleryImages.map((image, index) => (
                    <div key={`${index}-${image.slice(0, 32)}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                      <img src={image} alt={`Property photo ${index + 1}`} className="h-full w-full object-cover" />
                      {formData.coverImage === image && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow"><Star size={12} fill="currentColor" /> Cover photo</span>}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        {formData.coverImage !== image ? <button type="button" onClick={() => setCoverImage(image)} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-text shadow hover:bg-emerald-50">Set as cover</button> : <span className="px-2 text-xs font-medium text-white">Main photo</span>}
                        <button type="button" onClick={() => removeGalleryImage(image)} aria-label="Remove photo" className="rounded-lg bg-white/95 p-2 text-red-600 shadow hover:bg-red-50"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  ))}
                  {formData.galleryImages.length < MAX_GALLERY_IMAGES && (
                    <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-200 bg-white/80 px-4 text-center transition hover:border-emerald-400 hover:bg-white">
                      <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-primary-600">{imageLoading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}</span>
                      <span className="text-sm font-semibold text-text">{imageLoading ? 'Preparing photos…' : 'Upload photos'}</span>
                      <span className="mt-1 text-xs text-text-muted">JPEG, PNG or WebP · up to 350 KB each</span>
                      <input type="file" accept="image/*" multiple disabled={imageLoading} onChange={(event) => { handleImageFiles(event.target.files); event.target.value = ''; }} className="sr-only" />
                    </label>
                  )}
                </div>
                {formData.galleryImages.length === 0 && <p className="mt-3 text-xs text-text-muted">The first photo you add will be used as the cover on your public hotel page. Photos are resized before saving.</p>}
                {imageError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{imageError}</p>}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5">About this property</label>
              <textarea name="publicDescription" value={formData.publicDescription} onChange={handleChange} rows={3} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-background/40 p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-text"><Smartphone size={17} className="text-primary-600" /> Tax and online payments</h3>
            <p className="mb-5 mt-1 text-sm text-text-muted">Set the hotel tax, manage the payment connection, then save all changes.</p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5">Tax Percentage (%)</label>
              <input type="number" name="taxPercentage" step="0.01" value={formData.taxPercentage} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
            </div>

            {/* Moolre mobile money wallet for online booking payments */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-text mb-1.5 flex items-center gap-2">
                <Smartphone size={16} className="text-primary-600" />
                Moolre Mobile Money (Online Payments)
              </label>
              {isReplacingMoolreKeys ? (
                <div className="space-y-2">
                  <input type="text" name="moolreUsername" value={formData.moolreUsername} onChange={(event) => setFormData((current) => ({ ...current, moolreUsername: event.target.value }))} autoComplete="off" required placeholder="Moolre username" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 font-mono text-sm" />
                  <input type="password" name="moolrePublicKey" value={formData.moolrePublicKey} onChange={(event) => setFormData((current) => ({ ...current, moolrePublicKey: event.target.value }))} autoComplete="new-password" required placeholder="API public key" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 font-mono text-sm" />
                  <input type="text" inputMode="numeric" name="moolreAccountNumber" value={formData.moolreAccountNumber} onChange={(event) => setFormData((current) => ({ ...current, moolreAccountNumber: event.target.value }))} autoComplete="off" required placeholder="Wallet account number" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 font-mono text-sm" />
                  <input type="password" name="moolreWebhookSecret" value={formData.moolreWebhookSecret} onChange={(event) => setFormData((current) => ({ ...current, moolreWebhookSecret: event.target.value }))} autoComplete="new-password" placeholder="Wallet webhook secret (optional)" aria-describedby="moolre-webhook-hint" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 font-mono text-sm" />
                  <p id="moolre-webhook-hint" className="-mt-1 text-xs text-text-muted"><strong>Optional.</strong> Add it for instant payment confirmations. Without it, payments are still confirmed by status checks, just a little slower.</p>
                  <button type="button" onClick={() => { setIsReplacingMoolreKeys(false); setFormData((current) => ({ ...current, moolreUsername: '', moolrePublicKey: '', moolreAccountNumber: '', moolreWebhookSecret: '' })); }} className="text-sm font-semibold text-text-muted hover:text-text">Cancel key change</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setFormData((current) => ({ ...current, moolreUsername: '', moolrePublicKey: '', moolreAccountNumber: '', moolreWebhookSecret: '' })); setIsReplacingMoolreKeys(true); }} className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50">
                  {initialData?.hasMoolreKeys ? 'Replace Moolre keys' : 'Set Moolre keys'}
                </button>
              )}
              <p className="text-xs text-text-muted mt-1">
                Guests pay into this hotel's Moolre wallet by MTN MoMo, Telecel Cash or AT Money. In Moolre: Integrate Our APIs → API Service → Security → Generate API Keys.
                <a href="https://app.moolre.com" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline ml-1">Open Moolre →</a>
              </p>
              {(initialData?.hasMoolreKeys || initialData?.usesPlatformMoolreKeys) && (
                <p className="text-xs text-text-muted mt-1">Saving other property details keeps the current payment setup.</p>
              )}
              {initialData?.usesPlatformMoolreKeys && (
                <p className="text-xs text-success-700 mt-1">The platform Moolre wallet ({initialData.moolreMode === 'live' ? 'live' : 'sandbox'}) is currently used as this hotel’s default.</p>
              )}
              {initialData?.hasMoolreKeys && (
                <p className="text-xs text-success-700 mt-1">This hotel's own Moolre wallet {initialData.moolreAccountHint} is configured ({initialData.moolreMode === 'live' ? 'live' : 'sandbox'}). Keys are never shown here.{!initialData.hasMoolreWebhookSecret && ' No webhook secret: payments are confirmed by status checks only.'}</p>
              )}
            </div>
          </section>

          {/* Footer Buttons */}
          <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-3 border-t border-border bg-surface/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50 transition">Cancel</button>
            <button type="submit" disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              <Save size={16} /> {initialData ? 'Update Property' : 'Create Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
