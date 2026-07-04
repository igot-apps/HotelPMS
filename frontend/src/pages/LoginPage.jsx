// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { login } from '../api/auth';
import toast from 'react-hot-toast';
import { Loader2, Lock, User, Building2 } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  
  // Rename to storeLogin to avoid conflict with the imported API function
  const { login: storeLogin } = useAuthStore(); 
  
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Call the backend API
      const response = await login(formData);
      
      // 2. Extract data from the response
      // Notice how permissions is extracted from response.data.user
      const { user, accessToken, refreshToken } = response.data;
      const permissions = user.permissions; // 🚨 Extract from the user object!

      // 3. Save to Zustand Store
      storeLogin(user, { accessToken, refreshToken }, permissions);

      // 4. Success feedback & redirect
      toast.success(`Welcome back, ${user.fullName}!`);
      navigate('/dashboard');
      
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-xl p-8 space-y-6">
        
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 text-primary-600 mb-3">
            <Building2 size={24} />
          </div>
          <h1 className="text-2xl font-bold text-text">Hotel PMS</h1>
          <p className="text-sm text-text-muted mt-1">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Username</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                placeholder="e.g. gtetteh"
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-primary-600 text-text-inverted font-semibold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Sign In'}
          </button>
        </form>

        {/* Demo Credentials Helper (Based on your seed.js) */}
        <div className="text-center text-xs text-text-muted pt-4 border-t border-border space-y-1">
          <p className="font-semibold text-text">Demo Credentials (from seed.js):</p>
          <p>Manager: <span className="font-mono font-bold text-text">gtetteh / manager123</span></p>
          <p>Receptionist: <span className="font-mono font-bold text-text">jmensah / reception123</span></p>
          <p>Housekeeping: <span className="font-mono font-bold text-text">sakoto / housekeeping123</span></p>
        </div>
      </div>
    </div>
  );
}