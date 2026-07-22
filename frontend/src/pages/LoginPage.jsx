//pms login
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { loginUser } from '../api/auth'; // Ensure this matches your API file
import toast from 'react-hot-toast';
import { 
  Building2, Sparkles, Shield, ArrowRight, Eye, EyeOff, Loader2, 
  CheckCircle2, BedDouble, CreditCard, BarChart3 
} from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: loginUser,
        onSuccess: (response) => {
      const { user, accessToken, refreshToken } = response.data.data;
      
      // ✅ FIXED: Pull permissions directly from the user object and pass it as the 3rd argument!
      login(user, { accessToken, refreshToken }, user.permissions); 
      
      toast.success(`Welcome back, ${user.fullName}!`);
      navigate('/dashboard');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Invalid username or password.');
    },
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast.error('Please enter both username and password.');
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <div className="min-h-screen flex bg-background">
      
      {/* ========================================== */}
      {/* LEFT SIDE: BRANDING & REGISTRATION CTA     */}
      {/* ========================================== */}
      <div className="hidden lg:flex lg:w-1/2 bg-secondary-900 text-text-inverted flex-col justify-between p-12 relative overflow-hidden">
        {/* Background Glow Effect */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Building2 size={24} className="text-text-inverted" />
            </div>
            <span className="text-2xl font-bold tracking-tight">HotelPMS</span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
            The operating system for <span className="text-primary-400">modern hotels.</span>
          </h1>
          <p className="text-lg text-secondary-300 max-w-md mb-10">
            Manage reservations, rooms, staff, and financial reports for your property—all from one beautiful, unified dashboard.
          </p>

          {/* Feature List */}
          <div className="space-y-4 mb-12">
            <FeatureItem icon={BedDouble} text="Real-time room availability & housekeeping" />
            <FeatureItem icon={CreditCard} text="Secure payment processing & invoicing" />
            <FeatureItem icon={BarChart3} text="Automated financial reports & analytics" />
          </div>
        </div>

        {/* Registration CTA */}
        <div className="relative z-10 p-6 bg-secondary-800/50 border border-secondary-700 rounded-2xl backdrop-blur-sm">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-primary-600/20 rounded-lg">
              <Sparkles size={20} className="text-primary-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-text-inverted mb-1">Own a hotel?</h3>
              <p className="text-sm text-secondary-300 mb-4">
                Get your own isolated management system and public booking page in under 5 minutes.
              </p>
              <Link 
                to="/register-your-hotel" 
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary-400 hover:text-primary-300 transition group"
              >
                Register your hotel for free 
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* RIGHT SIDE: LOGIN FORM                     */}
      {/* ========================================== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo (Only shows on small screens) */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Building2 size={20} className="text-text-inverted" />
              </div>
              <span className="text-xl font-bold text-text">HotelPMS</span>
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-text tracking-tight">Welcome back</h2>
            <p className="text-text-muted mt-2">Sign in to your hotel's management dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-text mb-1.5">
                Username or Email
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="e.g. manager@hotel.com"
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-text">
                  Password
                </label>
                <a href="#" className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 bg-surface border border-border rounded-xl text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-primary-600 text-text-inverted font-semibold rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={18} /> Signing in...
                </>
              ) : (
                <>
                  <Shield size={18} /> Sign in to Dashboard
                </>
              )}
            </button>
          </form>

          {/* Mobile Registration Link */}
          <div className="lg:hidden text-center pt-6 border-t border-border">
            <p className="text-sm text-text-muted">
              Own a hotel?{' '}
              <Link to="/register-your-hotel" className="font-semibold text-primary-600 hover:text-primary-700">
                Create your free account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Component for the Left Side Features
function FeatureItem({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary-800 flex items-center justify-center">
        <CheckCircle2 size={16} className="text-primary-400" />
      </div>
      <span className="text-secondary-200">{text}</span>
    </div>
  );
}