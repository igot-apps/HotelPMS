import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Tag, Loader2, CheckCircle2, ArrowLeft, CreditCard, ShieldCheck, AlertCircle } from 'lucide-react';
import api from '../lib/axios';
import toast from 'react-hot-toast';
import PublicNavbar from '../components/public/PublicNavbar';

export default function PublicCheckoutPage() {
  const { propertyCode, roomTypeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // 🌟 1. Initialize dates from URL, but make them editable state
  const initialCheckIn = searchParams.get('checkIn');
  const initialCheckOut = searchParams.get('checkOut');
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);

  // 🌟 2. Check if user is already logged in (from localStorage)
  const [guestInfo, setGuestInfo] = useState(() => {
    const str = localStorage.getItem('guestInfo');
    return str && str !== 'undefined' ? JSON.parse(str) : null;
  });

  // 🌟 3. Form state for unauthenticated guests
  const [guestForm, setGuestForm] = useState({
    fullName: '',
    phone: '',
    email: ''
  });

  // ONLY redirect if initial dates are missing
  useEffect(() => {
    if (!initialCheckIn || !initialCheckOut) {
      navigate(`/public/${propertyCode}`);
    }
  }, [initialCheckIn, initialCheckOut, navigate, propertyCode]);

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

  // 🌟 Calculate Pricing Safely (Recalculates when dates change)
  const nights = Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)));
  const basePrice = selectedRoom ? parseFloat(selectedRoom.basePrice) : 0;
  const subtotal = basePrice * nights;
  const taxRate = property ? parseFloat(property.taxPercentage || 0) : 0;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  // Payment Initialization Mutation
  const initializePaymentMutation = useMutation({
    mutationFn: async (guestData) => {
      // 1. Create the reservation using the CURRENT state dates
      const resData = await api.post(`/public/${propertyCode}/reservations`, {
        checkInDate: checkIn,
        checkOutDate: checkOut,
        roomTypeId: parseInt(roomTypeId),
        guestFullName: guestData.name,
        guestPhone: guestData.phone,
        guestEmail: guestData.email || undefined,
        platformGuestId: guestData.platformGuestId, 
        agreedPricePerNight: basePrice,
      });

      const reservationId = resData.data.data.reservationId;
      
      // 2. Initialize Paystack
      const paystackRes = await api.post(`/public/${propertyCode}/payments/initialize`, {
        reservationId,
        email: guestData.email || 'guest@stayfolio.com',
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

  // 🌟 Handle Pay (Smart logic for logged-in vs guest)
  const handlePay = (e) => {
    e.preventDefault();
    
    let name, phone, email, platformGuestId;

    if (guestInfo) {
      name = guestInfo.fullName;
      phone = guestInfo.phone;
      email = guestInfo.email;
      platformGuestId = guestInfo.guestId;
    } else {
      if (!guestForm.fullName || !guestForm.phone) {
        toast.error('Please enter your full name and phone number.');
        return;
      }
      name = guestForm.fullName;
      phone = guestForm.phone;
      email = guestForm.email;
      platformGuestId = undefined;
    }

    initializePaymentMutation.mutate({ name, phone, email, platformGuestId });
  };

  if (isLoadingProp || isLoadingRooms) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  // ==========================================
  // SUCCESS STATE
  // ==========================================
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

          <div className="bg-warning-50 border border-warning-200 p-4 rounded-lg text-left mb-6 flex items-start gap-3">
            <AlertCircle size={18} className="text-warning-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-warning-800 mb-1">Notification Status</p>
              <p className="text-xs text-warning-700">
                SMS notifications are currently being configured. Please save your confirmation code above. A confirmation email will be sent shortly if you provided a valid email address.
              </p>
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

  // ==========================================
  // CHECKOUT STATE
  // ==========================================
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <PublicNavbar />
      
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-text-muted hover:text-text mb-6 transition">
          <ArrowLeft size={16} /> Back to Rooms
        </button>
        
        <form onSubmit={handlePay} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Booking Summary & Guest Details */}
          <div className="lg:col-span-2 space-y-6">
            <h1 className="text-2xl font-bold text-text">Review & Pay</h1>
            
            {/* 🌟 UPDATED: Editable Trip Details */}
            <div className="bg-surface p-6 rounded-xl border border-border">
              <h2 className="text-lg font-bold text-text mb-4 flex items-center gap-2">
                <Calendar size={20} className="text-primary-600"/> Your Trip
              </h2>
              <div className="p-4 bg-background rounded-lg border border-border space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-text">{selectedRoom?.typeName || 'Selected Room'}</p>
                    <p className="text-sm text-text-muted">{property?.propertyName} • {property?.city}</p>
                  </div>
                  <p className="text-xs font-bold text-primary-600 bg-primary-50 px-2 py-1 rounded-md border border-primary-100">
                    {nights} Night{nights > 1 ? 's' : ''}
                  </p>
                </div>
                
                {/* Editable Date Inputs */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Check In</label>
                    <input 
                      type="date" 
                      value={checkIn} 
                      onChange={(e) => setCheckIn(e.target.value)} 
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">Check Out</label>
                    <input 
                      type="date" 
                      value={checkOut} 
                      onChange={(e) => setCheckOut(e.target.value)} 
                      min={checkIn}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition" 
                    />
                  </div>
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

            {/* Smart Guest Details Section */}
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
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-muted mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={guestForm.fullName}
                      onChange={(e) => setGuestForm({...guestForm, fullName: e.target.value})}
                      required
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 outline-none transition"
                      placeholder="e.g. Kwame Mensah"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1">Phone Number *</label>
                      <input
                        type="tel"
                        value={guestForm.phone}
                        onChange={(e) => setGuestForm({...guestForm, phone: e.target.value})}
                        required
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 outline-none transition"
                        placeholder="e.g. 0244123456"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1">Email (Optional)</label>
                      <input
                        type="email"
                        value={guestForm.email}
                        onChange={(e) => setGuestForm({...guestForm, email: e.target.value})}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 outline-none transition"
                        placeholder="e.g. kwame@example.com"
                      />
                    </div>
                  </div>
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
              
              {/*  NEW: Safety Warning Message */}
              <div className="bg-warning-50 border border-warning-200 p-3 rounded-lg mb-4 flex items-start gap-2">
                <AlertCircle size={16} className="text-warning-700 mt-0.5 shrink-0" />
                <p className="text-xs text-warning-800 font-medium">
                  Please double-check your dates above. Once payment is processed, changes may require hotel approval.
                </p>
              </div>

              <button 
                type="submit"
                disabled={initializePaymentMutation.isPending}
                className="w-full py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary-600/20"
              >
                {initializePaymentMutation.isPending ? (
                  <><Loader2 className="animate-spin" size={18} /> Initializing...</>
                ) : (
                  <><CreditCard size={18} /> Continue to secure payment</>
                )}
              </button>
              
              <p className="text-[10px] text-text-muted text-center mt-3">
                Choose Mobile Money or card (Visa/Mastercard) on Paystack's secure checkout.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
