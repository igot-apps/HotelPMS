import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { initializeSubscriptionPayment } from '../api/billing';
import { CreditCard, Smartphone, Calendar, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BillingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // 🌟 Calculate Trial Days Remaining
  const getTrialStatus = () => {
    if (!user?.trialEndsAt) return { status: 'Unknown', daysLeft: 0, isExpired: false };
    
    const trialEnd = new Date(user.trialEndsAt);
    const today = new Date();
    const diffTime = trialEnd - today;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (user.subscriptionStatus === 'Active') {
      return { status: 'Active', daysLeft: 0, isExpired: false };
    }
    
    return { 
      status: daysLeft > 0 ? 'Trial' : 'Expired', 
      daysLeft: Math.max(0, daysLeft), 
      isExpired: daysLeft <= 0 
    };
  };

  const trialInfo = getTrialStatus();
  const subscriptionPrice = 200; // Example: 200 GHS per month

  const handleUpgrade = async (e) => {
    e.preventDefault();
    
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid Mobile Money number (e.g., 0551234567)');
      return;
    }

    setIsPaying(true);
    try {
      const response = await initializeSubscriptionPayment({
        email: user.email || 'manager@hotel.com', // Fallback if email is missing
        amount: subscriptionPrice,
        phone: phoneNumber,
        callbackUrl: window.location.origin + '/billing',
        propertyId: user.propertyId,
        planName: 'Pro', // Upgrading from Starter to Pro
      });

      if (response.data.success) {
        toast.success('Redirecting to Paystack Mobile Money...');
        // 🌟 Redirect the user to the Paystack checkout page
        window.location.href = response.data.data.authorization_url;
      } else {
        toast.error(response.data.message || 'Failed to initialize payment');
      }
    } catch (error) {
      console.error('Payment initialization error:', error);
      toast.error(error.response?.data?.message || 'An error occurred. Please try again.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text tracking-tight">Billing & Subscription</h1>
        <p className="text-text-muted mt-1">Manage your hotel's subscription plan and payment methods.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 🌟 Card 1: Current Plan Status */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary-50 rounded-lg">
              <CreditCard size={20} className="text-primary-600" />
            </div>
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
                {trialInfo.status === 'Active' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success-50 text-success-700 ring-1 ring-success-600/20">
                    <CheckCircle2 size={14} /> Active
                  </span>
                ) : trialInfo.isExpired ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger-50 text-danger-700 ring-1 ring-danger-600/20">
                    <AlertTriangle size={14} /> Expired
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning-50 text-warning-700 ring-1 ring-warning-600/20">
                    <Calendar size={14} /> {trialInfo.daysLeft} Days Left in Trial
                  </span>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-text-muted">
                {trialInfo.status === 'Active' 
                  ? 'Your subscription is active. You have full access to all features.' 
                  : trialInfo.isExpired 
                    ? 'Your free trial has ended. Please upgrade to continue using the PMS.' 
                    : `Enjoy full access to the PMS. Your free trial will end on ${new Date(user.trialEndsAt).toLocaleDateString()}.`}
              </p>
            </div>
          </div>
        </div>

        {/* 🌟 Card 2: Upgrade / Pay via Mobile Money */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-success-50 rounded-lg">
              <Smartphone size={20} className="text-success-600" />
            </div>
            <h2 className="text-lg font-bold text-text">Upgrade Subscription</h2>
          </div>

          <form onSubmit={handleUpgrade} className="space-y-5">
            <div>
              <p className="text-sm text-text-muted mb-3">
                Upgrade to the <span className="font-bold text-text">Pro Plan</span> for uninterrupted access.
              </p>
              <div className="text-3xl font-bold text-text mb-4">
                {subscriptionPrice} GHS <span className="text-sm font-normal text-text-muted">/ month</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">
                Mobile Money Number
              </label>
              <input
                type="tel"
                placeholder="e.g., 0551234567"
                value={phoneNumber}
                // 🚨 CRITICAL: Automatically remove any spaces the user types
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\s+/g, ''))} 
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
                required
                />
              <p className="text-xs text-text-muted mt-1.5">
                A prompt will be sent to this number to authorize the payment.
              </p>
            </div>

            <button
              type="submit"
              disabled={isPaying}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-success-600 text-text-inverted font-semibold rounded-xl hover:bg-success-700 transition shadow-lg shadow-success-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPaying ? (
                <>
                  <Loader2 className="animate-spin" size={18} /> Initializing Payment...
                </>
              ) : (
                <>
                  <Smartphone size={18} /> Pay {subscriptionPrice} GHS with MoMo
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}  