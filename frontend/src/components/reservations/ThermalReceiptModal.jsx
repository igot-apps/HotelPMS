import { X, Printer } from 'lucide-react';

export default function ThermalReceiptModal({ isOpen, onClose, reservation, stats }) {
  if (!isOpen || !reservation) return null;

  const handlePrint = () => {
    setTimeout(() => window.print(), 100);
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);
  const nights = Math.ceil((new Date(reservation.checkOutDate) - new Date(reservation.checkInDate)) / (1000 * 60 * 60 * 24));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm thermal-modal-wrapper">
      <div className="bg-white w-full max-w-xs rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col thermal-modal-wrapper">
        
        {/* Screen-only Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 print:hidden">
          <h2 className="text-lg font-bold text-gray-800">Thermal Receipt (80mm)</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 transition">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 thermal-scroll-area">
          
          {/* THE ACTUAL THERMAL RECEIPT CONTENT */}
          <div 
            className="bg-white shadow-lg mx-auto thermal-paper" 
            id="thermal-receipt-content"
            style={{ 
              width: '80mm', 
              fontFamily: "'Courier New', Courier, monospace", 
              fontSize: '12px', 
              lineHeight: '1.4', 
              color: '#000',
              padding: '2mm'
            }}
          >
            {/* Hotel Header */}
            <div className="text-center mb-2">
              <h1 className="text-base font-bold uppercase tracking-wider">{reservation.property?.propertyName || 'Hotel PMS'}</h1>
              <p className="text-[10px]">{reservation.property?.address || 'Address'}</p>
              <p className="text-[10px]">{reservation.property?.phone || 'Tel: 000-000-000'}</p>
            </div>

            <div className="border-t border-dashed border-black my-2"></div>

            {/* Receipt Meta */}
            <div className="flex justify-between text-[11px] mb-1">
              <span>Receipt #: {reservation.reservationId}</span>
              <span>{formatDate(new Date())}</span>
            </div>
            <div className="flex justify-between text-[11px] mb-1">
              <span>Time: {formatTime(new Date())}</span>
              <span>Cashier: {reservation.staff?.fullName || 'System'}</span>
            </div>

            <div className="border-t border-dashed border-black my-2"></div>

            {/* Guest Info */}
            <div className="text-[11px] mb-1">
              <p className="font-bold">GUEST: {reservation.guest?.fullName}</p>
              <p>{reservation.guest?.phone || ''}</p>
            </div>
            <div className="flex justify-between text-[11px] mb-1">
              <span>Check-in: {formatDate(reservation.checkInDate)}</span>
              <span>Check-out: {formatDate(reservation.checkOutDate)}</span>
            </div>
            <div className="text-[11px] font-bold mb-1">
              TOTAL NIGHTS: {nights}
            </div>

            <div className="border-t border-dashed border-black my-2"></div>

            {/* Charges */}
            <p className="text-[11px] font-bold mb-1">ACCOMMODATION CHARGES:</p>
            {reservation.reservationRooms?.map((rr) => {
              const rate = parseFloat(rr.agreedPricePerNight || 0);
              const subtotal = rate * nights;
              return (
                <div key={rr.reservationRoomId} className="text-[11px] mb-1">
                  <div className="flex justify-between">
                    <span>Room {rr.room?.roomNumber} ({rr.roomType?.typeName})</span>
                  </div>
                  <div className="flex justify-between pl-2">
                    <span>{nights} nights x {formatCurrency(rate)}</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                </div>
              );
            })}

            <div className="border-t border-dashed border-black my-2"></div>

            {/* Totals */}
            <div className="flex justify-between text-[11px] mb-1">
              <span>Subtotal:</span>
              <span>{formatCurrency(stats?.totalAmount)} GHS</span>
            </div>
            <div className="flex justify-between text-[11px] mb-1">
              <span>Total Paid:</span>
              <span>{formatCurrency(stats?.totalPaid)} GHS</span>
            </div>
            <div className="border-t border-black my-1"></div>
            <div className="flex justify-between text-sm font-bold mb-2">
              <span>BALANCE DUE:</span>
              <span>{formatCurrency(stats?.balanceDue)} GHS</span>
            </div>

            <div className="border-t border-dashed border-black my-2"></div>

            {/* Payment Details */}
            {reservation.payments?.length > 0 && (
              <>
                <p className="text-[11px] font-bold mb-1">PAYMENT HISTORY:</p>
                {reservation.payments.map(p => (
                  <div key={p.paymentId} className="text-[11px] mb-1">
                    <div className="flex justify-between">
                      <span>{formatDate(p.paymentDate)} ({p.paymentMethod})</span>
                      <span>{formatCurrency(p.amount)}</span>
                    </div>
                    {p.gatewayReference && <p className="pl-2 text-[9px]">Ref: {p.gatewayReference}</p>}
                  </div>
                ))}
                <div className="border-t border-dashed border-black my-2"></div>
              </>
            )}

            {/* Footer */}
            <div className="text-center text-[10px] mt-4 mb-2">
              <p className="font-bold">THANK YOU FOR STAYING WITH US!</p>
              <p>Please retain this receipt for your records.</p>
              <p className="mt-2">*** HAVE A GREAT DAY ***</p>
            </div>
          </div>
        </div>
      </div>

      {/* 🖨️ THERMAL PRINT STYLES */}
      <style>{`
        @media print {
          /* Set exact 80mm paper size, auto height (continuous roll) */
          @page {
            size: 80mm auto;
            margin: 0;
          }
          
          body * { visibility: hidden !important; }
          
          #thermal-receipt-content, #thermal-receipt-content * { 
            visibility: visible !important; 
          }
          
          #thermal-receipt-content {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            margin: 0 !important;
            /* Thermal printers don't use color, force B&W */
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .thermal-modal-wrapper, .thermal-scroll-area {
            position: static !important;
            display: block !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            background: transparent !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}