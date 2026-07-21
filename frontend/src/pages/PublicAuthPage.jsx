import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { Building2, Mail, Phone, User, Lock, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PublicAuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);

  const from = location.state?.from || '/discover';

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const authMutation = useMutation({
    mutationFn: async (data) => {
      if (isLogin) {
        // 🌟 FIXED: Changed from 'phoneOrEmail' to 'phone'
        const res = await api.post('/public/auth/login', {
          phone: data.phone,
          password: data.password,
        });
        return res.data;
      } else {
        const res = await api.post('/public/auth/register', {
          fullName: data.fullName,
          phone: data.phone,
          email: data.email || undefined,
          password: data.password,
        });
        return res.data;
      }
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        // 🌟 FIXED: Extract 'guest' instead of 'user'
        const guestData = data.data.guest;
        const token = data.data.token;
        
        if (guestData && token) {
          // 🌟 FIXED: Save to authStore
          login(guestData, token);
          
          // 🌟 FIXED: Save to localStorage (so checkout page can read it)
          localStorage.setItem('guestInfo', JSON.stringify(guestData));
          localStorage.setItem('guestToken', token);
          
          toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
          navigate(from, { replace: true });
        } else {
          toast.error('Invalid response from server');
        }
      } else {
        toast.error(data.message || 'Authentication failed');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'An error occurred. Please check your details.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      if (!formData.password || !formData.phone) return toast.error('Please enter your phone and password');
    } else {
      if (!formData.fullName || !formData.phone || !formData.password) return toast.error('Please fill in all required fields');
    }
    authMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/discover" className="flex items-center gap-2 group">
            <Building2 className="text-primary-600 group-hover:text-primary-700 transition" size={24} />
            <span className="text-lg font-black text-text tracking-tight">Stayfolio</span>
          </Link>
          <Link to="/discover" className="flex items-center gap-1 text-sm text-text-muted hover:text-text transition">
            <ArrowLeft size={16} /> Back to Discover
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-xl p-8">
          <div className="flex p-1 bg-secondary-100 rounded-lg mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                isLogin ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${
                !isLogin ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
              }`}
            >
              Create Account
            </button>
          </div>

          <h2 className="text-2xl font-bold text-text mb-1">
            {isLogin ? 'Welcome back!' : 'Create your account'}
          </h2>
          <p className="text-sm text-text-muted mb-6">
            {isLogin 
              ? 'Enter your details to access your reservations.' 
              : 'Join us to book stays and manage your trips easily.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-bold text-text-muted mb-1">Full Name</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text" name="fullName" value={formData.fullName} onChange={handleChange}
                    placeholder="Kwame Mensah"
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">
                {isLogin ? 'Phone Number' : 'Phone Number'}
              </label>
              <div className="relative">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="tel" name="phone" value={formData.phone} onChange={handleChange}
                  placeholder="024XXXXXXX"
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                />
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-xs font-bold text-text-muted mb-1">Email (Optional)</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="email" name="email" value={formData.email} onChange={handleChange}
                    placeholder="kwame@example.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="password" name="password" value={formData.password} onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                />
              </div>
            </div>

            <button
              type="submit" disabled={authMutation.isPending}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authMutation.isPending ? (
                <><Loader2 className="animate-spin" size={18} /> Processing...</>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}