import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Tag, Loader2, CheckCircle2, ArrowLeft, Smartphone, ShieldCheck, LogIn, X } from 'lucide-react';
import api from '../lib/axios';
import toast from 'react-hot-toast';

import PublicAuthModal from '../components/public/PublicAuthModal';
import PublicNavbar from '../components/public/PublicNavbar';

export default function PublicCheckoutPage() {
  const { propertyCode, roomTypeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const checkIn = searchParams.get('checkIn');
  const checkOut = searchParams.get('checkOut');

  // 🌟 Convert to state so it can be updated when the modal closes
  const [guestInfo, setGuestInfo] = useState(() => {
    const str = localStorage.getItem('guestInfo');
    return str && str !== 'undefined' ? JSON.parse(str) : null;
  });
  const [guestToken, setGuestToken] = useState(() => localStorage.getItem('guestToken'));

  // 🌟 State for the Login Prompt Modal (Soft Gate)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  
  // 🌟 State for the Auth Modal
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // ONLY redirect if dates are missing
  useEffect(() => {
    if (!checkIn || !checkOut) {
      navigate(`/public/${propertyCode}`);
    }
  }, [checkIn, checkOut, navigate, propertyCode]);

  // Fetch Property (for tax rate)
  const { data: property, isLoading: isLoadingProp } = useQuery({
    queryKey: ['publicProperty', propertyCode],
    queryFn: async () => (await api.get(`/public/${propertyCode}`)).data.data,
  });

  // Fetch Room Types
  const { data: roomTypes, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['publicRooms', propertyCode],
    queryFn: async () => (await api.get(`/public/${propertyCode}/room-types`)).data.data,
  });

  const selectedRoom = roomTypes?.find(r => r.roomTypeId === parseInt(roomTypeId));

  // Calculate Pricing Safely
  const nights = Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)));
  const basePrice = selectedRoom ? parseFloat(selectedRoom.basePrice) : 0;
  const subtotal = basePrice * nights;
  const taxRate = property ? parseFloat(property.taxPercentage || 0) : 0;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  // Payment Initialization Mutation
  const initializePaymentMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the reservation
      const resData = await api.post(`/public/${propertyCode}/reservations`, {
        checkInDate: checkIn,
        checkOutDate: checkOut,
        roomTypeId: parseInt(roomTypeId),
        guestFullName: guestInfo.fullName,
        guestPhone: guestInfo.phone,
        guestEmail: guestInfo.email || 'guest@example.com',
        platformGuestId: guestInfo.guestId,
        agreedPricePerNight: basePrice,
      });
      
      const reservationId = resData.data.data.reservationId;

      // 2. Initialize Paystack
      const paystackRes = await api.post(`/public/${propertyCode}/payments/initialize`, {
        reservationId,
        email: guestInfo.email || 'guest@example.com',
        amount: totalAmount,
      });

      return paystackRes.data.data; 
    },
    onSuccess: (paystackData) => {
      // 3. Redirect to Paystack
      window.location.href = paystackData.authorization_url;
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to initialize payment.');
    }
  });

  const [confirmationData, setConfirmationData] = useState(null);

  // THE SOFT GATE: Show Modal if not logged in
  const handlePay = () => {
    if (!guestToken || !guestInfo) {
      setShowLoginPrompt(true); 
      return;
    }
    initializePaymentMutation.mutate();
  };

  // 🌟 Open the Auth Modal instead of navigating away
  const handleProceedToLogin = () => {
    setShowLoginPrompt(false);
    setIsAuthModalOpen(true); 
  };

  // 🌟 Refresh auth state when modal closes
  const handleAuthModalClose = () => {
    setIsAuthModalOpen(false);
    // Re-read from localStorage in case they just logged in via the popup
    const str = localStorage.getItem('guestInfo');
    setGuestInfo(str && str !== 'undefined' ? JSON.parse(str) : null);
    setGuestToken(localStorage.getItem('guestToken'));
  };

  if (isLoadingProp || isLoadingRooms) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  // SUCCESS STATE
  if (confirmationData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-surface rounded-2xl shadow-xl border border-border p-8 text-center">
          <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">Booking Confirmed!</h1>
          <p className="text-text-muted mb-6">Your reservation at {property?.propertyName} has been successfully processed.</p>
          
          <div className="bg-background p-4 rounded-lg border border-border text-left space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Confirmation Code:</span>
              <span className="font-bold text-primary-600 uppercase tracking-wider">{confirmationData.confirmationCode}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Guest:</span>
              <span className="font-semibold text-text">{confirmationData.guestName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Total Amount:</span>
              <span className="font-bold text-text">GH₵ {confirmationData.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <p className="text-xs text-text-muted mb-6">Please save your confirmation code. You will need it for check-in.</p>
          
          <button 
            onClick={() => navigate(`/public/${propertyCode}`)}
            className="w-full py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition"
          >
            Return to Hotel Page
          </button>
        </div>
      </div>
    );
  }

  // CHECKOUT STATE
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      {/* 🌟 ADD THE NAVBAR HERE */}
      <PublicNavbar />
      
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text mb-6 transition">
          <ArrowLeft size={16} /> Back to Rooms
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Booking Summary */}
          <div className="lg:col-span-2 space-y-6">
            <h1 className="text-2xl font-bold text-text">Review & Pay</h1>
            
            {/* Trip Details */}
            <div className="bg-surface p-6 rounded-xl border border-border">
              <h2 className="text-lg font-bold text-text mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-primary-600"/> Your Trip
              </h2>
              <div className="flex justify-between items-center p-4 bg-background rounded-lg border border-border">
                <div>
                  <p className="font-bold text-text">{selectedRoom?.typeName || 'Selected Room'}</p>
                  <p className="text-sm text-text-muted">{property?.propertyName} • {property?.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text">{new Date(checkIn).toLocaleDateString()} - {new Date(checkOut).toLocaleDateString()}</p>
                  <p className="text-xs text-text-muted">{nights} Night{nights > 1 ? 's' : ''}</p>
                </div>
              </div>
              
              {selectedRoom?.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {selectedRoom.amenities.map((link) => (
                    <span key={link.amenityId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary-50 text-secondary-700 border border-secondary-200">
                      <Tag size={12} /> {link.amenity.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Guest Details */}
            <div className="bg-surface p-6 rounded-xl border border-border">
              <h2 className="text-lg font-bold text-text mb-4 flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary-600"/> Guest Details
              </h2>
              {guestInfo ? (
                <div className="p-4 bg-background rounded-lg border border-border space-y-1">
                  <p className="text-sm text-text-muted">Booking for:</p>
                  <p className="font-bold text-text">{guestInfo.fullName}</p>
                  <p className="text-sm text-text-muted">{guestInfo.phone} {guestInfo.email ? `• ${guestInfo.email}` : ''}</p>
                </div>
              ) : (
                <div className="p-4 bg-primary-50 rounded-lg border border-primary-100 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <LogIn size={16} className="text-primary-600" />
                    <p className="text-sm font-semibold text-primary-700">Guest information required</p>
                  </div>
                  <p className="text-xs text-primary-600">You will be prompted to log in or register when you click "Pay with Mobile Money".</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Price Breakdown & Pay */}
          <div className="lg:col-span-1">
            <div className="bg-surface p-6 rounded-xl border border-border sticky top-6">
              <h2 className="text-lg font-bold text-text mb-4">Price Details</h2>
              
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between text-text">
                  <span>GH₵ {basePrice.toFixed(2)} x {nights} night{nights > 1 ? 's' : ''}</span>
                  <span>GH₵ {subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-text">
                    <span>Tax ({taxRate}%)</span>
                    <span>GH₵ {taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-3 flex justify-between font-bold text-base text-text">
                  <span>Total</span>
                  <span className="text-primary-600">GH₵ {totalAmount.toFixed(2)}</span>
                </div>
              </div>

              <button 
                onClick={handlePay}
                disabled={initializePaymentMutation.isPending}
                className="w-full py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {initializePaymentMutation.isPending ? (
                  <><Loader2 className="animate-spin" size={18} /> Initializing...</>
                ) : (
                  <><Smartphone size={18} /> Pay with Mobile Money</>
                )}
              </button>
              
              <p className="text-[10px] text-text-muted text-center mt-3">
                Secure payment via MTN MoMo, Vodafone Cash, or AirtelTigo Money
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 ========================================== */}
      {/* 🌟 LOGIN PROMPT MODAL (THE SOFT GATE) */}
      {/* 🌟 ========================================== */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border p-6 text-center relative">
            <button 
              onClick={() => setShowLoginPrompt(false)} 
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-secondary-100 text-text-muted transition"
            >
              <X size={18} />
            </button>
            <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn size={24} className="text-primary-600" />
            </div>
            <h3 className="text-xl font-bold text-text mb-2">Login Required</h3>
            <p className="text-sm text-text-muted mb-6">
              Please log in or create a free account to complete your booking and secure your room.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="flex-1 py-2.5 border border-border rounded-lg text-text font-semibold hover:bg-secondary-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToLogin}
                className="flex-1 py-2.5 bg-primary-600 text-text-inverted rounded-lg font-semibold hover:bg-primary-700 transition flex items-center justify-center gap-2"
              >
                <LogIn size={16} /> Login / Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 ========================================== */}
      {/* 🌟 BEAUTIFUL AUTH MODAL (REUSABLE) */}
      {/* 🌟 ========================================== */}
      <PublicAuthModal 
        isOpen={isAuthModalOpen} 
        onClose={handleAuthModalClose} 
      />
    </div>
  );
}