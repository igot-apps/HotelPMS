import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Lock, Phone, User, Mail, ArrowLeft } from 'lucide-react';
import api from '../lib/axios';
import toast from 'react-hot-toast';

export default function GuestAuthPage() {
  const { propertyCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the redirect path from location state, or default to a generic checkout
  const redirectPath = location.state?.from || `/public/${propertyCode}/checkout`;

  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ fullName: '', phone: '', email: '', password: '' });

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const authMutation = useMutation({
    mutationFn: async (data) => {
      const endpoint = isLogin ? '/public/auth/login' : '/public/auth/register';
      const res = await api.post(endpoint, data);
      return res.data;
    },
    onSuccess: (response) => {
      // Save token and guest info to localStorage
      localStorage.setItem('guestToken', response.data.token);
      localStorage.setItem('guestInfo', JSON.stringify(response.data.data));
      
      toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
      navigate(redirectPath);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Authentication failed');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLogin) {
      authMutation.mutate({ phone: formData.phone, password: formData.password });
    } else {
      authMutation.mutate(formData);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl border border-border p-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text mb-6 transition">
          <ArrowLeft size={16} /> Back to Hotel
        </button>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-sm text-text-muted">
            {isLogin ? 'Login to complete your booking securely.' : 'Create an account to book your stay and manage reservations.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} required={!isLogin} className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="Kwame Mensah" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="024xxxxxxx" />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Email (Optional)</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="kwame@example.com" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              <input type="password" name="password" value={formData.password} onChange={handleChange} required className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text outline-none focus:ring-2 focus:ring-primary-500/20" placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" disabled={authMutation.isPending} className="w-full py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 disabled:opacity-50">
            {authMutation.isPending && <Loader2 className="animate-spin" size={18} />}
            {isLogin ? 'Login & Continue' : 'Create Account & Continue'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-text-muted">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary-600 font-semibold hover:underline">
              {isLogin ? 'Register here' : 'Login here'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}