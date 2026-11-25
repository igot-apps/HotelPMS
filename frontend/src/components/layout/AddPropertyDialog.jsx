import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, MapPin, X } from 'lucide-react';
import { addProperty } from '../../api/auth';
import { isWithinGhanaBounds, googleMapsUrl, GHANA_REGIONS } from '../../utils/ghanaCoordinates';

const input = 'w-full px-3 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500';

export default function AddPropertyDialog({ onClose, onAdded }) {
  const [form, setForm] = useState({ hotelName: '', slug: '', email: '', phone: '', area: '', city: '', region: '', latitude: '', longitude: '' });
  const [saving, setSaving] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    first.current?.focus();
    const escape = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, saving]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'hotelName') next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return next;
    });
  };

  const captureLocation = () => {
    if (!navigator.geolocation) return toast.error('Location is unavailable in this browser. Enter coordinates from Google Maps.');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!isWithinGhanaBounds(coords.latitude, coords.longitude)) return toast.error('This location is outside Ghana. Enter the property’s coordinates from Google Maps.');
      setForm((current) => ({ ...current, latitude: String(coords.latitude), longitude: String(coords.longitude) }));
    }, () => toast.error('Location access was unavailable. Enter coordinates from Google Maps.'), { enableHighAccuracy: true, timeout: 12000 });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!isWithinGhanaBounds(Number(form.latitude), Number(form.longitude)) || !form.latitude || !form.longitude) {
      toast.error('Enter the property’s Google Maps coordinates within Ghana.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await addProperty({ ...form, latitude: Number(form.latitude), longitude: Number(form.longitude) });
      toast.success(`${data.data.propertyName} added. Choose a plan to start using it.`);
      onClose();
      onAdded?.(data.data);
    } catch {
      setSaving(false); // the request interceptor shows the reason
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="add-property-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 id="add-property-title" className="text-lg font-bold text-text">Add a property</h2>
            <p className="text-xs text-text-muted">Uses your current sign-in. It has its own rooms, staff, money and plan.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="p-2 rounded-lg hover:bg-secondary-50 text-text-muted"><X size={20} /></button>
        </header>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto space-y-3 px-4 py-4">
            <div><label htmlFor="ap-name" className="block text-sm font-semibold mb-1">Property name *</label><input ref={first} id="ap-name" name="hotelName" value={form.hotelName} onChange={change} required maxLength={200} className={input} /></div>
            <div>
              <label htmlFor="ap-slug" className="block text-sm font-semibold mb-1">Website address *</label>
              <div className="flex items-center gap-1"><input id="ap-slug" name="slug" value={form.slug} onChange={change} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className={input} /><span className="shrink-0 text-sm text-text-muted">.hideout24.com</span></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label htmlFor="ap-email" className="block text-sm font-semibold mb-1">Property email</label><input id="ap-email" type="email" name="email" value={form.email} onChange={change} className={input} /></div>
              <div><label htmlFor="ap-phone" className="block text-sm font-semibold mb-1">Property phone</label><input id="ap-phone" type="tel" name="phone" value={form.phone} onChange={change} className={input} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label htmlFor="ap-area" className="block text-sm font-semibold mb-1">Area *</label><input id="ap-area" name="area" value={form.area} onChange={change} required className={input} /></div>
              <div><label htmlFor="ap-city" className="block text-sm font-semibold mb-1">City *</label><input id="ap-city" name="city" value={form.city} onChange={change} required className={input} /></div>
              <div><label htmlFor="ap-region" className="block text-sm font-semibold mb-1">Region *</label>
                <select id="ap-region" name="region" value={form.region} onChange={change} required className={input}>
                  <option value="">Select</option>
                  {GHANA_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="ap-lat" className="block text-sm font-semibold mb-1">Latitude *</label><input id="ap-lat" type="number" step="any" name="latitude" value={form.latitude} onChange={change} required placeholder="e.g. 5.6037" className={input} /></div>
              <div><label htmlFor="ap-lng" className="block text-sm font-semibold mb-1">Longitude *</label><input id="ap-lng" type="number" step="any" name="longitude" value={form.longitude} onChange={change} required placeholder="e.g. -0.1870" className={input} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button type="button" onClick={captureLocation} className="inline-flex items-center gap-1 font-semibold text-primary-700"><MapPin size={16} /> Use my current location</button>
              {form.latitude && form.longitude && isWithinGhanaBounds(Number(form.latitude), Number(form.longitude)) && <a href={googleMapsUrl(form.latitude, form.longitude)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-700 underline">Check pin ↗</a>}
            </div>
            <p className="rounded-lg bg-secondary-50 border border-border p-3 text-xs text-text-muted">New properties do not get a free trial. The property stays read-only until you choose a plan for it on Billing &amp; Plan. Your other properties and their plans are not affected.</p>
          </div>
          <footer className="flex justify-end gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 px-4 rounded-lg border border-border font-semibold text-text">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-11 px-4 rounded-lg bg-primary-600 text-text-inverted font-semibold inline-flex items-center gap-2 disabled:opacity-60">{saving && <Loader2 size={16} className="animate-spin" />} Add property</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
