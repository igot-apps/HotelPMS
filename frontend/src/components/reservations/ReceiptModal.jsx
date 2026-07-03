import { X, Printer } from 'lucide-react';

export default function ReceiptModal({ isOpen, onClose, reservation, stats }) {
  if (!isOpen || !reservation) return null;

  const handlePrint = () => {
    // Small timeout ensures the DOM is fully ready before triggering the print dialog
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);

  const nights = Math.ceil((new Date(reservation.checkOutDate) - new Date(reservation.checkInDate)) / (1000 * 60 * 60 * 24));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print-modal-wrapper">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col print-modal-wrapper">
        
        {/* Screen-only Header (Hidden when printing) */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 print:hidden">
          <h2 className="text-lg font-bold text-gray-800">Guest Folio / Receipt</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition">
              <Printer size={16} /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 print-scroll-area">
          
          {/* THE ACTUAL RECEIPT CONTENT (This ID is targeted by the CSS) */}
          <div className="max-w-md mx-auto font-sans text-gray-800" id="print-receipt-content">
            
            {/* Hotel Header */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
              <h1 className="text-2xl font-bold tracking-tight">{reservation.property?.propertyName || 'Hotel PMS'}</h1>
              <p className="text-sm text-gray-600 mt-1">{reservation.property?.address || 'Address'}</p>
              <p className="text-sm text-gray-600">{reservation.property?.city}, {reservation.property?.country}</p>
            </div>

            {/* Receipt Info */}
            <div className="flex justify-between text-sm mb-6">
              <div>
                <p className="font-bold text-gray-900">GUEST FOLIO / RECEIPT</p>
                <p className="text-gray-600">Date: {formatDate(new Date())}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-600">Res. No: <span className="font-bold text-gray-900">#{reservation.reservationId}</span></p>
                <p className="text-gray-600">Status: <span className="font-bold text-gray-900">{reservation.status}</span></p>
              </div>
            </div>

            {/* Guest Info */}
            <div className="mb-6 p-3 bg-gray-50 rounded-lg print:bg-gray-100 print:p-2 print:border print:border-gray-300">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Guest Details</p>
              <p className="text-sm font-bold text-gray-900">{reservation.guest?.fullName}</p>
              <p className="text-xs text-gray-600">{reservation.guest?.phone} • {reservation.guest?.email}</p>
              {reservation.guest?.idNumber && <p className="text-xs text-gray-600">ID: {reservation.guest.idNumber}</p>}
            </div>

            {/* Stay Details */}
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase mb-2">Stay Details</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-gray-600 text-xs">Check-in</p>
                  <p className="font-semibold">{formatDate(reservation.checkInDate)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs">Check-out</p>
                  <p className="font-semibold">{formatDate(reservation.checkOutDate)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-xs">Nights</p>
                  <p className="font-semibold">{nights}</p>
                </div>
              </div>
            </div>

            {/* Charges Table */}
            <div className="mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 text-xs font-bold text-gray-500 uppercase">Description</th>
                    <th className="text-center py-2 text-xs font-bold text-gray-500 uppercase">Qty</th>
                    <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Rate</th>
                    <th className="text-right py-2 text-xs font-bold text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reservation.reservationRooms?.map((rr) => {
                    const rate = parseFloat(rr.agreedPricePerNight || 0);
                    const subtotal = rate * nights;
                    return (
                      <tr key={rr.reservationRoomId} className="border-b border-gray-100">
                        <td className="py-2">
                          <p className="font-semibold text-gray-900">Room {rr.room?.roomNumber}</p>
                          <p className="text-xs text-gray-500">{rr.roomType?.typeName || rr.room?.roomType?.typeName}</p>
                        </td>
                        <td className="text-center py-2 text-gray-700">{nights}</td>
                        <td className="text-right py-2 text-gray-700">{formatCurrency(rate)}</td>
                        <td className="text-right py-2 font-semibold text-gray-900">{formatCurrency(subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t-2 border-gray-800 pt-2 mb-6">
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-700">Subtotal</span>
                <span className="font-semibold text-gray-900">{formatCurrency(stats?.totalAmount)} GHS</span>
              </div>
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-700">Total Paid</span>
                <span className="font-semibold text-green-600">{formatCurrency(stats?.totalPaid)} GHS</span>
              </div>
              <div className="flex justify-between text-base py-2 border-t border-gray-300 mt-2">
                <span className="font-bold text-gray-900">Balance Due</span>
                <span className="font-bold text-gray-900">{formatCurrency(stats?.balanceDue)} GHS</span>
              </div>
            </div>

            {/* Payment History */}
            {reservation.payments?.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Payment History</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-1">Date</th>
                      <th className="text-left py-1">Method</th>
                      <th className="text-left py-1">Reference</th>
                      <th className="text-right py-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservation.payments.map(p => (
                      <tr key={p.paymentId} className="border-b border-gray-100">
                        <td className="py-1">{formatDate(p.paymentDate)}</td>
                        <td className="py-1">{p.paymentMethod}</td>
                        <td className="py-1 text-gray-500">{p.gatewayReference || '-'}</td>
                        <td className="text-right py-1 font-semibold">{formatCurrency(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer & Signatures */}
            <div className="text-center mt-12 pt-6 border-t border-gray-200">
              <p className="text-sm font-semibold text-gray-800 mb-1">Thank you for staying with us!</p>
              <p className="text-xs text-gray-500 mb-6">We look forward to welcoming you back.</p>
              
              <div className="flex justify-between mt-12 text-xs text-gray-600">
                <div className="text-center">
                  <div className="border-t border-gray-400 w-32 pt-1">Guest Signature</div>
                </div>
                <div className="text-center">
                  <div className="border-t border-gray-400 w-32 pt-1">Authorized Signature</div>
                </div>
              </div>
              
              <p className="text-[10px] text-gray-400 mt-8">Generated by Hotel PMS • {new Date().toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 🖨️ BULLETPROOF PRINT STYLES */}
      <style>{`
        @media print {
          /* 1. Hide EVERYTHING on the screen */
          body * {
            visibility: hidden !important;
          }
          
          /* 2. Show ONLY the receipt and its children */
          #print-receipt-content, #print-receipt-content * {
            visibility: visible !important;
          }
          
          /* 3. Break the receipt out of the modal overlay and place it at the top of the page */
          #print-receipt-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            display: block !important;
          }

          /* 4. Force ALL parent modal containers to stop acting as fixed overlays or clipping content */
          .print-modal-wrapper, .print-scroll-area {
            position: static !important;
            inset: auto !important;
            background: transparent !important;
            backdrop-filter: none !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
          }
          
          /* 5. Force browsers to print background colors and borders */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          @page {
            margin: 1.5cm;
            size: A4;
          }
        }
      `}</style>
    </div>
  );
}