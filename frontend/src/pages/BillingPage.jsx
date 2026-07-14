import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { initializeSubscriptionPayment, verifyPayment } from '../api/billing';
import { CreditCard, Smartphone, Calendar, CheckCircle2, AlertTriangle, Loader2, Tag, ShieldCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillingPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasVerifiedRef = useRef(false); // 🔒 Lock to prevent React Strict Mode double-firing
  
  const [isPaying, setIsPaying] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(1);

  const pricingTiers = [
    { months: 1, label: 'Monthly', price: 200, discount: '' },
    { months: 3, label: 'Quarterly', price: 550, discount: 'Save 50 GHS' },
    { months: 12, label: 'Yearly', price: 2000, discount: '2 Months Free!' },
  ];

  const currentTier = pricingTiers.find(t => t.months === selectedDuration);

  // 🌟 BULLETPROOF STATUS CHECKER
  const getSubscriptionStatus = () => {
    const today = new Date();

    // 1. Check Paid Subscription First
    if (user?.subscriptionStatus === 'Active' && user?.subscriptionEndsAt) {
      const subEnd = new Date(user.subscriptionEndsAt);
      if (!isNaN(subEnd.getTime())) {
        const diffTime = subEnd - today;
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) return { status: 'Active', daysLeft, isExpired: false, endDate: subEnd.toLocaleDateString() };
        else return { status: 'Expired', daysLeft: 0, isExpired: true, endDate: subEnd.toLocaleDateString() };
      }
    }

    // 2. Check Trial
    if (user?.subscriptionStatus === 'Trial' && user?.trialEndsAt) {
      const trialEnd = new Date(user.trialEndsAt);
      if (!isNaN(trialEnd.getTime())) {
        const diffTime = trialEnd - today;
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { status: daysLeft > 0 ? 'Trial' : 'Expired', daysLeft: Math.max(0, daysLeft), isExpired: daysLeft <= 0, endDate: trialEnd.toLocaleDateString() };
      }
    }

    // 3. Fallback (Prevents "null" crashes)
    return { status: 'Unknown', daysLeft: 0, isExpired: false, endDate: null };
  };

  const subInfo = getSubscriptionStatus();

  // 🌟 AUTO-VERIFY FALLBACK: Catches the redirect from Paystack
  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    
    if (reference && !hasVerifiedRef.current) {
      hasVerifiedRef.current = true; // 🔒 Lock
      setSearchParams({}); // Clean URL

      const activateSubscription = async () => {
        const toastId = toast.loading('Verifying your payment...');
        try {
          const res = await verifyPayment(reference);
          if (res.data.data.status === 'success') {
            toast.success('🎉 Payment successful! Reloading your dashboard...', { id: toastId });
            setTimeout(() => window.location.reload(), 1500); 
          } else {
            toast.error('Payment was not completed successfully.', { id: toastId });
          }
        } catch (error) {
          toast.error('Payment verification failed.', { id: toastId });
        }
      };
      activateSubscription();
    }
  }, [searchParams, setSearchParams]);

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
      } else {
        toast.error(response.data.message || 'Failed to initialize payment');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'An error occurred.');
    } finally {
      setIsPaying(false);
    }
  };

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
              <p className="text-2xl font-bold text-text">{user?.subscriptionPlan || 'Starter'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Status</p>
              <div className="flex items-center gap-2">
                {subInfo.status === 'Active' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-50 text-success-700 ring-1 ring-success-600/20">
                    <CheckCircle2 size={14} /> Active ({subInfo.daysLeft} Days Left)
                  </span>
                ) : subInfo.isExpired ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger-50 text-danger-700 ring-1 ring-danger-600/20">
                    <AlertTriangle size={14} /> Expired
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning-50 text-warning-700 ring-1 ring-warning-600/20">
                    <Calendar size={14} /> {subInfo.daysLeft || 0} Days Left in Trial
                  </span>
                )}
              </div>
            </div>
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-text-muted">
                {subInfo.status === 'Active' 
                  ? `🎉 Your subscription is active! It expires on ${subInfo.endDate}.` 
                  : subInfo.isExpired 
                    ? 'Your subscription or trial has ended. Please upgrade to continue using the PMS.' 
                    : `Enjoy full access to the PMS. Your free trial will end on ${subInfo.endDate || 'soon'}.`}
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Upgrade / Select Duration */}
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
                  Click the button below to be redirected to Paystack's secure checkout page.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPaying}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-success-600 text-text-inverted font-semibold rounded-xl hover:bg-success-700 transition shadow-lg shadow-success-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPaying ? (
                <><Loader2 className="animate-spin" size={18} /> Initializing Payment...</>
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