import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Calendar, Building2 } from 'lucide-react';
import PublicAuthModal from './PublicAuthModal';

export default function PublicNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // 🌟 STRICT ISOLATION: Read ONLY from public guest localStorage. 
  // We completely ignore the PMS authStore so staff logins never leak here.
  const [guestInfo, setGuestInfo] = useState(null);

  // Check for guest on mount
  useEffect(() => {
    const str = localStorage.getItem('guestInfo');
    setGuestInfo(str && str !== 'undefined' ? JSON.parse(str) : null);
  }, []);

  // Listen for storage changes (e.g., if the user logs out in another tab)
  useEffect(() => {
    const handleStorageChange = () => {
      const str = localStorage.getItem('guestInfo');
      setGuestInfo(str && str !== 'undefined' ? JSON.parse(str) : null);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isAuthenticated = !!guestInfo;

  const handleLogout = () => {
    // 🌟 1. Clear ONLY the public guest keys (Leaves PMS staff login completely untouched)
    localStorage.removeItem('guestInfo');
    localStorage.removeItem('guestToken');
    
    // 🌟 2. Update local state immediately
    setGuestInfo(null);
    
    // 🌟 3. Redirect to public discover page
    navigate('/discover');
    setIsOpen(false);
  };

  return (
    <>
      <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* 🌟 Logo / Brand */}
            <Link to="/discover" className="flex items-center gap-2 group">
              <Building2 className="text-primary-600 group-hover:text-primary-700 transition" size={28} />
              <span className="text-xl font-black text-text tracking-tight">Stayfolio</span>
            </Link>

            {/* 🌟 Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link to="/discover" className="text-sm font-semibold text-text-muted hover:text-primary-600 transition">
                Discover Hotels
              </Link>
              
              {isAuthenticated ? (
                <>
                  <Link to="/public/reservations" className="text-sm font-semibold text-text-muted hover:text-primary-600 transition flex items-center gap-1.5">
                    <Calendar size={16} /> My Reservations
                  </Link>
                  <div className="flex items-center gap-3 pl-4 border-l border-border">
                    <div className="flex items-center gap-2 text-sm font-medium text-text">
                      <User size={16} className="text-primary-600" />
                      {/* 🌟 Display public guest name, never PMS staff name */}
                      <span>{guestInfo?.fullName || guestInfo?.phone || 'Guest'}</span>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-danger-600 bg-danger-50 hover:bg-danger-100 rounded-lg transition"
                    >
                      <LogOut size={16} /> Logout
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition shadow-sm shadow-primary-600/20"
                >
                  Sign In
                </button>
              )}
            </div>

            {/* 🌟 Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 rounded-lg text-text-muted hover:bg-secondary-100 transition"
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* 🌟 Mobile Menu Dropdown */}
        {isOpen && (
          <div className="md:hidden border-t border-border bg-surface shadow-lg">
            <div className="px-4 py-4 space-y-3">
              <Link
                to="/discover"
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2.5 text-base font-medium text-text hover:bg-secondary-50 rounded-lg transition"
              >
                Discover Hotels
              </Link>
              
              {isAuthenticated ? (
                <>
                  <Link
                    to="/public/reservations"
                    onClick={() => setIsOpen(false)}
                    className="block px-3 py-2.5 text-base font-medium text-text hover:bg-secondary-50 rounded-lg transition flex items-center gap-2"
                  >
                    <Calendar size={18} className="text-primary-600" /> My Reservations
                  </Link>
                  <div className="pt-3 border-t border-border">
                    <div className="px-3 py-2 text-sm font-medium text-text-muted flex items-center gap-2">
                      <User size={16} className="text-primary-600" />
                      {guestInfo?.fullName || guestInfo?.phone || 'Guest'}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2.5 text-base font-semibold text-danger-600 bg-danger-50 hover:bg-danger-100 rounded-lg transition"
                    >
                      <LogOut size={18} /> Logout
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => { setIsAuthModalOpen(true); setIsOpen(false); }}
                  className="block w-full text-center px-4 py-2.5 text-base font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* 🌟 Render the Auth Modal at the root level so it overlays correctly */}
      <PublicAuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => {
          setIsAuthModalOpen(false);
          // 🌟 Re-read localStorage immediately so the navbar updates without a refresh
          const str = localStorage.getItem('guestInfo');
          setGuestInfo(str && str !== 'undefined' ? JSON.parse(str) : null);
        }} 
      />
    </>
  );
}