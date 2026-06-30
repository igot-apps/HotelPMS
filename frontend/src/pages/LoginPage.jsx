import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { username, password });
      if (response.data.success) {
        const { user, accessToken, refreshToken } = response.data.data;
        login(user, { accessToken, refreshToken });
        navigate('/dashboard');
      } else {
        setError(response.data.message || 'Invalid credentials');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    // 1. App Background
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      
      {/* 2. Card Surface & Border */}
      <div className="w-full max-w-md bg-surface p-8 rounded-xl shadow-lg border border-border">
        
        <div className="text-center mb-8">
          {/* 3. Brand Color */}
          <h1 className="text-2xl font-bold text-primary-600">🏨 Hotel PMS</h1>
          {/* 4. Muted Text */}
          <p className="text-text-muted text-sm mt-2">Sign in to your account</p>
        </div>

        {/* 5. Error State (Danger) */}
        {error && (
          <div className="bg-danger-50 text-danger-600 p-3 rounded-lg text-sm mb-4 border border-danger-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">Username</label>
            {/* 6. Input Surface, Border, Focus Ring */}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition bg-surface text-text"
              placeholder="Enter your username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition bg-surface text-text"
              placeholder="Enter your password"
              required
            />
          </div>
          
          {/* 7. Primary Button with Inverted Text */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-text-inverted py-2.5 rounded-lg font-semibold hover:bg-primary-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
          </button>
        </form>

        {/* 8. Footer with Secondary Background for code blocks */}
        <div className="mt-6 pt-6 border-t border-border text-center text-xs text-text-muted">
          <p className="font-semibold mb-1">Test Credentials:</p>
          <p>
            Manager: <code className="bg-secondary-100 px-1 rounded text-secondary-700">gtetteh</code> / <code className="bg-secondary-100 px-1 rounded text-secondary-700">manager123</code>
          </p>
        </div>
      </div>
    </div>
  );
}