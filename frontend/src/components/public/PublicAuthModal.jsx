import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../lib/axios';
import { X, Phone, User, Lock, Loader2, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { startGuestSession } from '../../lib/guestSession';

export default function PublicAuthModal({ isOpen, onClose }) {
  const [isLogin, setIsLogin] = useState(true);

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFormData({ fullName: '', phone: '', password: '', confirmPassword: '' });
      setIsLogin(true);
    }
  }, [isOpen]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const authMutation = useMutation({
    mutationFn: async (data) => {
      if (isLogin) {
        const res = await api.post('/public/auth/login', {
          phone: data.phone,
          password: data.password,
        });
        return res.data;
      } else {
        const res = await api.post('/public/auth/register', {
          fullName: data.fullName,
          phone: data.phone,
          password: data.password,
        });
        return res.data;
      }
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        const guestData = data.data.guest;
        const token = data.data.token;
        
        if (guestData && token) {
          startGuestSession(guestData, token);
          
          toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
          onClose(); 
        }
      } else {
        toast.error(data.message || 'Authentication failed');
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Invalid credentials. Please try again.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      if (!formData.phone || !formData.password) return toast.error('Phone and password are required');
    } else {
      if (!formData.fullName || !formData.phone || !formData.password) return toast.error('Please fill in all required fields');
      if (!formData.confirmPassword) return toast.error('Please confirm your password');
      if (formData.password !== formData.confirmPassword) return toast.error('Passwords do not match');
    }
    authMutation.mutate(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-6 md:p-8 z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
          <X size={20} />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Building2 className="text-primary-600" size={24} />
          <span className="text-lg font-black text-text tracking-tight">Stayfolio</span>
        </div>

        <div className="flex p-1 bg-secondary-100 rounded-lg mb-6">
          <button onClick={() => setIsLogin(true)} className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${isLogin ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>Sign In</button>
          <button onClick={() => setIsLogin(false)} className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${!isLogin ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}>Create Account</button>
        </div>

        <h2 className="text-2xl font-bold text-text mb-1">{isLogin ? 'Welcome back!' : 'Join Stayfolio'}</h2>
        <p className="text-sm text-text-muted mb-6">{isLogin ? 'Sign in to manage your bookings.' : 'Create an account to book your next stay.'}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Full Name</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Kwame Mensah" className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-text-muted mb-1">Phone Number</label>
            <div className="relative">
              <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="024XXXXXXX" className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-text-muted mb-1">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input type="password" name="password" value={formData.password} onChange={handleChange} autoComplete={isLogin ? 'current-password' : 'new-password'} required placeholder="••••••••" className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
            </div>
          </div>
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1">Confirm Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} autoComplete="new-password" required placeholder="Re-enter your password" className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" />
              </div>
            </div>
          )}
          <button type="submit" disabled={authMutation.isPending} className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30 disabled:opacity-50 disabled:cursor-not-allowed mt-6">
            {authMutation.isPending ? (<><Loader2 className="animate-spin" size={18} /> Processing...</>) : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 border-t border-border pt-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Hotel team?</p>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm">
            <Link to="/hotel/login" onClick={onClose} className="font-semibold text-primary-700 hover:underline">Staff sign in</Link>
            <span className="text-text-muted">·</span>
            <Link to="/for-hotels" onClick={onClose} className="font-semibold text-primary-700 hover:underline">Hotel onboarding</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
