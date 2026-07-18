import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import api from '../lib/axios';

export default function PublicBookingSuccessPage() {
  const { propertyCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const reference = searchParams.get('reference');
  const [verificationStatus, setVerificationStatus] = useState('loading'); // 'loading' | 'success' | 'failed'
  const [transactionData, setTransactionData] = useState(null);

  // Fetch property details
  const { data: property } = useQuery({
    queryKey: ['publicProperty', propertyCode],
    queryFn: async () => (await api.get(`/public/${propertyCode}`)).data.data,
  });

  // Verify payment on mount
  useEffect(() => {
    const verifyPayment = async () => {
      if (!reference) {
        setVerificationStatus('failed');
        return;
      }

      try {
        const res = await api.get(`/public/${propertyCode}/payments/verify/${reference}`);
        
        if (res.data.status === 'success') {
          setTransactionData(res.data.data);
          setVerificationStatus('success');
        } else {
          setVerificationStatus('failed');
        }
      } catch (error) {
        console.error('Verification failed:', error);
        setVerificationStatus('failed');
      }
    };

    verifyPayment();
  }, [reference, propertyCode]);

  if (verificationStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="animate-spin text-primary-600 mx-auto mb-4" size={48} />
          <p className="text-text-muted">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (verificationStatus === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-surface rounded-2xl shadow-xl border border-border p-8 text-center">
          <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-success-600" />
          </div>
          <h1 className="text-2xl font-bold text-text mb-2">Payment Successful!</h1>
          <p className="text-text-muted mb-6">Your reservation at {property?.propertyName} has been confirmed.</p>
          
          <div className="bg-background p-4 rounded-lg border border-border text-left space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Reference:</span>
              <span className="font-bold text-primary-600 uppercase tracking-wider">{transactionData?.reference}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Amount Paid:</span>
              <span className="font-bold text-text">GH₵ {(transactionData?.amount / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Payment Method:</span>
              <span className="font-semibold text-text">{transactionData?.channel || 'Mobile Money'}</span>
            </div>
          </div>

          <p className="text-xs text-text-muted mb-6">
            A confirmation has been sent to your phone. Please save this reference for check-in.
          </p>
          
          <button 
            onClick={() => navigate(`/public/${propertyCode}`)}
            className="w-full py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} /> Return to Hotel Page
          </button>
        </div>
      </div>
    );
  }

  // Failed state
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-surface rounded-2xl shadow-xl border border-border p-8 text-center">
        <div className="w-16 h-16 bg-error-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={32} className="text-error-600" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Payment Failed</h1>
        <p className="text-text-muted mb-6">
          We couldn't verify your payment. Please contact the hotel or try again.
        </p>
        
        <div className="flex gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="flex-1 py-3 border border-border text-text font-bold rounded-lg hover:bg-secondary-50 transition"
          >
            Try Again
          </button>
          <button 
            onClick={() => navigate(`/public/${propertyCode}`)}
            className="flex-1 py-3 bg-primary-600 text-text-inverted font-bold rounded-lg hover:bg-primary-700 transition"
          >
            Back to Hotel
          </button>
        </div>
      </div>
    </div>
  );
}