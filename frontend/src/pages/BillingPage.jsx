import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { initializeSubscriptionPayment, verifyPayment, fetchSubscriptionStatus } from '../api/billing';
import { CreditCard, Smartphone, Calendar, CheckCircle2, AlertTriangle, Loader2, Tag, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillingPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasVerifiedRef = useRef(false);
  
  const [isPaying, setIsPaying] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(1);
  
  // 🌟 FRESH DATA STATE: Holds the live truth from the database
  const [freshData, setFreshData] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const pricingTiers = [
    { months: 1, label: 'Monthly', price: 200, discount: '' },
    { months: 3, label: 'Quarterly', price: 550, discount: 'Save 50 GHS' },
    { months: 12, label: 'Yearly', price: 2000, discount: '2 Months Free!' },
  ];

  const currentTier = pricingTiers.find(t => t.months === selectedDuration);

  // 🌟 1. FETCH FRESH DATA FROM DATABASE ON PAGE LOAD
  useEffect(() => {
    const getLiveStatus = async () => {
      try {
        const res = await fetchSubscriptionStatus();
        if (res.data.success) {
          setFreshData(res.data.data);
          
          // 🌟 SYNC BACK TO ZUSTAND: Update localStorage so the Sidebar/Navbar knows too!
          useAuthStore.setState({
            user: {
              ...user,
              subscriptionPlan: res.data.data.subscriptionPlan,
              subscriptionStatus: res.data.data.subscriptionStatus,
              trialEndsAt: res.data.data.trialEndsAt,
              subscriptionEndsAt: res.data.data.subscriptionEndsAt,
            }
          });
        }
      } catch (error) {
        console.error('Failed to fetch fresh subscription status', error);
      } finally {
        setIsLoadingStatus(false);
      }
    };
    getLiveStatus();
  }, []);

  // 🌟 2. HANDLE PAYSTACK REDIRECT & INSTANT UPDATE
  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    
    if (reference && !hasVerifiedRef.current) {
      hasVerifiedRef.current = true;
      setSearchParams({});

      const activateSubscription = async () => {
        const toastId = toast.loading('Verifying your payment...');
        try {
          const res = await verifyPayment(reference);
          if (res.data.data.status === 'success') {
            toast.success('🎉 Payment successful! Your subscription is now active.', { id: toastId });
            
            // Fetch the fresh data immediately after payment to update the UI
            const freshRes = await fetchSubscriptionStatus();
            if (freshRes.data.success) {
              setFreshData(freshRes.data.data);
              useAuthStore.setState({
                user: { ...user, ...freshRes.data.data }
              });
            }
          } else {
            toast.error('Payment was not completed successfully.', { id: toastId });
          }
        } catch (error) {
          toast.error('Payment verification failed.', { id: toastId });
        }
      };
      activateSubscription();
    }
  }, [searchParams, setSearchParams, user]);

  // 🌟 3. BULLETPROOF STATUS CALCULATOR (Uses freshData, handles 'Expired' explicitly)
  const getSubscriptionStatus = () => {
    if (!freshData) return { status: 'Loading', daysLeft: 0, isExpired: false, endDate: null };

    const today = new Date();

    // 🚨 EXPLICITLY CHECK FOR EXPIRED STATUS (Fixes the confusion!)
    if (freshData.subscriptionStatus === 'Expired') {
      return { 
        status: 'Expired', 
        daysLeft: 0, 
        isExpired: true, 
        endDate: freshData.subscriptionEndsAt ? new Date(freshData.subscriptionEndsAt).toLocaleDateString() : 'N/A'
      };
    }

    // Check Paid Subscription (Active)
    if (freshData.subscriptionStatus === 'Active' && freshData.subscriptionEndsAt) {
      const subEnd = new Date(freshData.subscriptionEndsAt);
      if (!isNaN(subEnd.getTime())) {
        const diffTime = subEnd - today;
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) {
          return { status: 'Active', daysLeft, isExpired: false, endDate: subEnd.toLocaleDateString() };
        } else {
          // DB says Active, but date passed -> Treat as Expired
          return { status: 'Expired', daysLeft: 0, isExpired: true, endDate: subEnd.toLocaleDateString() };
        }
      }
    }

    // Check Trial
    if (freshData.subscriptionStatus === 'Trial' && freshData.trialEndsAt) {
      const trialEnd = new Date(freshData.trialEndsAt);
      if (!isNaN(trialEnd.getTime())) {
        const diffTime = trialEnd - today;
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) {
          return { status: 'Trial', daysLeft, isExpired: false, endDate: trialEnd.toLocaleDateString() };
        } else {
          // Trial ended -> Treat as Expired
          return { status: 'Expired', daysLeft: 0, isExpired: true, endDate: trialEnd.toLocaleDateString() };
        }
      }
    }

    return { status: 'Unknown', daysLeft: 0, isExpired: false, endDate: null };
  };

  const subInfo = getSubscriptionStatus();

  const handleUpgrade = async (e) => {
    e.preventDefault();
    setIsPaying(true);
    try {
      const response = await initializeSubscriptionPayment({
        email: user.email || 'manager@hotel.com',
        phone: '0240000000', 
        callbackUrl: window.location.origin + '/billing',
        propertyId: user.propertyId,
        planName: 'Pro',
        durationMonths: selectedDuration,
      });

      if (response.data.success) {
        toast.success(`Redirecting to Paystack...`);
        window.location.href = response.data.data.authorization_url;
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'An error occurred.');
    } finally {
      setIsPaying(false);
    }
  };

  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-text tracking-tight">Billing & Subscription</h1>
        <p className="text-text-muted mt-1">Manage your hotel's subscription plan and payment methods.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Current Plan Status */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary-50 rounded-lg"><CreditCard size={20} className="text-primary-600" /></div>
            <h2 className="text-lg font-bold text-text">Current Plan</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Plan Name</p>
              <p className="text-2xl font-bold text-text">{freshData?.subscriptionPlan || 'Starter'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Status</p>
              <div className="flex items-center gap-2">
                {subInfo.status === 'Active' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-50 text-success-700 ring-1 ring-success-600/20">
                    <CheckCircle2 size={14} /> Active ({subInfo.daysLeft} Days Left)
                  </span>
                ) : subInfo.isExpired ? (
                  // 🚨 CLEAR EXPIRED UI
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger-50 text-danger-700 ring-1 ring-danger-600/20">
                    <AlertTriangle size={14} /> Expired
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning-50 text-warning-700 ring-1 ring-warning-600/20">
                    <Calendar size={14} /> {subInfo.daysLeft} Days Left in Trial
                  </span>
                )}
              </div>
            </div>
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-text-muted">
                {subInfo.status === 'Active' 
                  ? `🎉 Your subscription is active! It expires on ${subInfo.endDate}.` 
                  : subInfo.isExpired 
                    ? '⚠️ Your subscription has expired. Please upgrade below to restore full access to the PMS.' 
                    : `Enjoy full access to the PMS. Your free trial will end on ${subInfo.endDate}.`}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Upgrade */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-success-50 rounded-lg"><Smartphone size={20} className="text-success-600" /></div>
            <h2 className="text-lg font-bold text-text">Upgrade Subscription</h2>
          </div>

          <form onSubmit={handleUpgrade} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-text mb-2">Select Billing Duration</label>
              <div className="grid grid-cols-3 gap-2">
                {pricingTiers.map((tier) => (
                  <button
                    key={tier.months}
                    type="button"
                    onClick={() => setSelectedDuration(tier.months)}
                    className={`relative p-3 rounded-xl border-2 text-center transition-all ${
                      selectedDuration === tier.months
                        ? 'border-success-500 bg-success-50/50 shadow-md'
                        : 'border-border hover:border-success-200 bg-background'
                    }`}
                  >
                    {tier.discount && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-warning-100 text-warning-700 text-[10px] font-bold rounded-full flex items-center gap-0.5 whitespace-nowrap">
                        <Tag size={8} /> {tier.discount}
                      </span>
                    )}
                    <p className="text-xs font-semibold text-text-muted uppercase">{tier.label}</p>
                    <p className="text-lg font-bold text-text mt-1">{tier.price} GHS</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck size={20} className="text-secondary-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-text">Secure Mobile Money Checkout</p>
                <p className="text-xs text-text-muted mt-1">
                  You will be redirected to Paystack to complete your payment securely.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPaying}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-success-600 text-text-inverted font-semibold rounded-xl hover:bg-success-700 transition shadow-lg shadow-success-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPaying ? (
                <><Loader2 className="animate-spin" size={18} /> Initializing...</>
              ) : (
                <><Smartphone size={18} /> Pay {currentTier.price} GHS for {currentTier.months} Month{currentTier.months > 1 ? 's' : ''}</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}