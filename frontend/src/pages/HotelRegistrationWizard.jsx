import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { registerHotel } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { Building2, User, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Sparkles, MapPin, LocateFixed } from 'lucide-react';

const GHANA_REGIONS = [
  'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern', 'Greater Accra',
  'North East', 'Northern', 'Oti', 'Savannah', 'Upper East', 'Upper West',
  'Volta', 'Western', 'Western North',
];

export default function HotelRegistrationWizard() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Hotel Details
    hotelName: '',
    slug: '',
    email: '',
    phone: '',
    area: '',
    city: '',
    region: '',
    ghanaPostAddress: '',
    latitude: null,
    longitude: null,
    // Step 2: Owner Details
    ownerName: '',
    ownerEmail: '',
    password: '',
  });
  const [locationState, setLocationState] = useState('idle');

  const mutation = useMutation({
    mutationFn: registerHotel,
    onSuccess: (response) => {
      const { user, accessToken, refreshToken, permissions } = response.data.data;
      
      // 🌟 AUTO-LOGIN: Save the new owner's data to Zustand
      login(user, { accessToken, refreshToken }, user.permissions); 
      
      toast.success('Welcome aboard! Your hotel is ready.');
      
      // Redirect to the dashboard
      navigate('/dashboard');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to register hotel.');
    },
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      // Auto-generate slug from hotel name (URL friendly)
      if (name === 'hotelName') {
        updated.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      return updated;
    });
  };

  const nextStep = (e) => {
    e.preventDefault();
    setStep(2);
  };

  const prevStep = () => setStep(1);

  const captureHotelLocation = () => {
    if (!navigator.geolocation) {
      setLocationState('unsupported');
      return;
    }
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFormData((prev) => ({ ...prev, latitude: coords.latitude, longitude: coords.longitude }));
        setLocationState('captured');
      },
      (error) => {
        setLocationState(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text flex items-center justify-center gap-2">
            <Sparkles className="text-primary-500" size={28} /> Register Your Hotel
          </h1>
          <p className="text-text-muted mt-2">Get your own hotel management system and public booking page in minutes.</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center justify-center mb-8 gap-4">
          <StepIndicator step={1} currentStep={step} icon={Building2} label="Hotel Details" />
          <div className={`h-1 w-12 rounded-full transition-colors ${step > 1 ? 'bg-primary-500' : 'bg-border'}`} />
          <StepIndicator step={2} currentStep={step} icon={User} label="Owner Account" />
        </div>

        {/* Form Card */}
        <div className="bg-surface border border-border rounded-2xl shadow-xl p-8">
          <form onSubmit={step === 1 ? nextStep : handleSubmit}>
            
            {/* ========================================== */}
            {/* STEP 1: HOTEL DETAILS                      */}
            {/* ========================================== */}
            {step === 1 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Hotel Name *</label>
                  <input 
                    type="text" name="hotelName" value={formData.hotelName} onChange={handleChange} required
                    placeholder="e.g. Sunset Beach Resort"
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Your Unique URL Slug *</label>
                  <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500">
                    <span className="px-3 py-3 bg-secondary-50 text-text-muted text-sm border-r border-border">myapp.com/hotels/</span>
                    <input 
                      type="text" name="slug" value={formData.slug} onChange={handleChange} required
                      placeholder="sunset-beach-resort"
                      className="flex-1 px-3 py-3 bg-transparent text-text outline-none text-sm" 
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">This will be the public link guests use to book rooms.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-text mb-1.5">Hotel Email *</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text mb-1.5">Phone Number *</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-text flex items-center gap-2"><MapPin size={16} className="text-primary-600" /> Hotel location</h2>
                    <p className="text-xs text-text-muted mt-1">Add the Ghana location guests will recognize. GPS is optional and can be captured while you are at the hotel.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-text mb-1.5">Region *</label>
                      <select name="region" value={formData.region} onChange={handleChange} required className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500">
                        <option value="">Select region</option>
                        {GHANA_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-text mb-1.5">City / Town *</label>
                      <input type="text" name="city" value={formData.city} onChange={handleChange} required placeholder="e.g. Accra" className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-text mb-1.5">Area / Neighbourhood *</label>
                      <input type="text" name="area" value={formData.area} onChange={handleChange} required placeholder="e.g. Osu" className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text mb-1.5">GhanaPost GPS address <span className="font-normal text-text-muted">(optional)</span></label>
                    <input type="text" name="ghanaPostAddress" value={formData.ghanaPostAddress} onChange={handleChange} placeholder="e.g. GA-123-4567" maxLength={20} className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
                    <p className="text-xs text-text-muted mt-1">Saved as a guest-facing address. We do not send it to a third-party geocoding service.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary-50/50 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text">Pin the hotel using this device</p>
                        <p className="text-xs text-text-muted mt-1">For the best result, allow location access while you are at the hotel.</p>
                      </div>
                      <button type="button" onClick={captureHotelLocation} disabled={locationState === 'loading'} className="inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border text-text font-semibold rounded-lg hover:bg-secondary-50 disabled:opacity-60">
                        {locationState === 'loading' ? <Loader2 className="animate-spin" size={16} /> : <LocateFixed size={16} />}
                        {locationState === 'loading' ? 'Getting location…' : locationState === 'captured' ? 'Update GPS pin' : 'Use my current location'}
                      </button>
                    </div>
                    {locationState === 'captured' && <p role="status" className="mt-3 text-sm font-medium text-primary-700">Hotel location saved from this device.</p>}
                    {locationState === 'denied' && <p role="alert" className="mt-3 text-sm text-warning-700">Location access was blocked. Enable it in your browser settings, or continue with the address details above.</p>}
                    {locationState === 'unsupported' && <p role="alert" className="mt-3 text-sm text-warning-700">This browser cannot provide GPS. You can continue with the address details above.</p>}
                    {locationState === 'failed' && <p role="alert" className="mt-3 text-sm text-warning-700">Could not get a GPS fix. Check device location settings or try again at the hotel.</p>}
                  </div>
                </div>

                <button type="submit" className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition shadow-md mt-6">
                  Next: Create Owner Account <ArrowRight size={18} />
                </button>
              </div>
            )}

            {/* ========================================== */}
            {/* STEP 2: OWNER ACCOUNT                      */}
            {/* ========================================== */}
            {step === 2 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-4 bg-primary-50 border border-primary-100 rounded-lg text-sm text-primary-800 flex gap-2">
                  <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
                  <span>Almost there! Now create your personal manager account to access the dashboard.</span>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Your Full Name *</label>
                  <input type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} required
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Your Email (Username) *</label>
                  <input type="email" name="ownerEmail" value={formData.ownerEmail} onChange={handleChange} required
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Create Password *</label>
                  <input type="password" name="password" value={formData.password} onChange={handleChange} required minLength={6}
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" 
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button type="button" onClick={prevStep} className="flex items-center justify-center gap-2 px-6 py-3 bg-surface border border-border text-text font-semibold rounded-lg hover:bg-secondary-50 transition">
                    <ArrowLeft size={18} /> Back
                  </button>
                  <button type="submit" disabled={mutation.isPending} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition shadow-md disabled:opacity-50">
                    {mutation.isPending ? <><Loader2 className="animate-spin" size={18} /> Creating Hotel...</> : <>Create My Hotel <Sparkles size={18} /></>}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <p className="text-center text-text-muted text-sm mt-8">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}

// Helper Component for the Progress Bar
function StepIndicator({ step, currentStep, icon: Icon, label }) {
  const isActive = step === currentStep;
  const isComplete = step < currentStep;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
        isComplete ? 'bg-primary-600 border-primary-600 text-text-inverted' : 
        isActive ? 'bg-background border-primary-600 text-primary-600' : 
        'bg-background border-border text-text-muted'
      }`}>
        {isComplete ? <CheckCircle2 size={20} /> : <Icon size={18} />}
      </div>
      <span className={`text-xs font-semibold ${isActive ? 'text-text' : 'text-text-muted'}`}>{label}</span>
    </div>
  );
}
