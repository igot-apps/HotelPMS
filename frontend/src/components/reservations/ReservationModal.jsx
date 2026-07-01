import { useState, useEffect } from 'react';
import { X, Loader2, Calendar, BedDouble, AlertCircle } from 'lucide-react';
import { getAvailableRooms } from '../../api/rooms';
import { getGuests } from '../../api/guests';
import { useAuthStore } from '../../store/authStore';

export default function ReservationModal({ isOpen, onClose, onSubmit, isLoading }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  const [guests, setGuests] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isFetchingRooms, setIsFetchingRooms] = useState(false);
  
  const [formData, setFormData] = useState({
    guestId: '',
    checkInDate: '',
    checkOutDate: '',
    source: 'Walk-in',
    roomId: '',
    roomTypeId: '',
    agreedPrice: '',
    amountPaid: '0',
    paymentMethod: 'Cash',
    notes: '',
  });

  // Load guests when modal opens
  useEffect(() => {
    if (isOpen) {
      getGuests({ limit: 100 }).then(res => {
        setGuests(res.data.data || []);
      }).catch(err => console.error(err));
      
      // Set default dates (Today to Tomorrow)
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      setFormData(prev => ({ ...prev, checkInDate: today, checkOutDate: tomorrow }));
    }
  }, [isOpen]);

  // Fetch available rooms when dates change
  useEffect(() => {
    if (formData.checkInDate && formData.checkOutDate && propertyId) {
      if (new Date(formData.checkInDate) >= new Date(formData.checkOutDate)) {
        setAvailableRooms([]);
        return;
      }

      setIsFetchingRooms(true);
      getAvailableRooms(formData.checkInDate, formData.checkOutDate, propertyId)
        .then(res => {
          setAvailableRooms(res.data.data || []);
          // Reset selected room if it's no longer available
          setFormData(prev => ({ ...prev, roomId: '', roomTypeId: '', agreedPrice: '' }));
        })
        .catch(err => {
          console.error(err);
          setAvailableRooms([]);
        })
        .finally(() => setIsFetchingRooms(false));
    }
  }, [formData.checkInDate, formData.checkOutDate, propertyId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const selectRoom = (room) => {
    setFormData({
      ...formData,
      roomId: room.roomId,
      roomTypeId: room.roomTypeId,
      agreedPrice: parseFloat(room.roomType.basePrice).toFixed(2),
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.roomId) return;

    const payload = {
      propertyId,
      guestId: parseInt(formData.guestId),
      source: formData.source,
      checkInDate: formData.checkInDate,
      checkOutDate: formData.checkOutDate,
      rooms: [{
        roomId: parseInt(formData.roomId),
        roomTypeId: parseInt(formData.roomTypeId),
        agreedPricePerNight: parseFloat(formData.agreedPrice),
      }],
      amountPaid: parseFloat(formData.amountPaid) || 0,
      paymentMethod: formData.paymentMethod,
      notes: formData.notes,
    };
    onSubmit(payload);
  };

  // ==========================================
  // NEW: Calculate Booking Summary Dynamically
  // ==========================================
  const calculateNights = () => {
    if (formData.checkInDate && formData.checkOutDate) {
      const start = new Date(formData.checkInDate);
      const end = new Date(formData.checkOutDate);
      const diffTime = end - start;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    }
    return 0;
  };

  const nights = calculateNights();
  const pricePerNight = parseFloat(formData.agreedPrice) || 0;
  const totalCost = nights * pricePerNight;
  const amountPaid = parseFloat(formData.amountPaid) || 0;
  const balanceDue = totalCost - amountPaid;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-text">New Reservation</h2>
            <p className="text-sm text-text-muted mt-1">Create a new booking and assign a room.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          
          {/* Guest & Source */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Guest *</label>
              <select name="guestId" value={formData.guestId} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                <option value="">Select a guest...</option>
                {guests.map(g => (
                  <option key={g.guestId} value={g.guestId}>{g.fullName} ({g.phone})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Booking Source</label>
              <select name="source" value={formData.source} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                <option value="Walk-in">Walk-in</option>
                <option value="Phone">Phone</option>
                <option value="Website">Website</option>
                <option value="Direct">Direct</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Check-in Date *</label>
              <input type="date" name="checkInDate" value={formData.checkInDate} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Check-out Date *</label>
              <input type="date" name="checkOutDate" value={formData.checkOutDate} onChange={handleChange} required
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>
          </div>

          {/* Room Selection */}
          <div>
            <label className="block text-sm font-semibold text-text mb-2">Select Available Room *</label>
            
            {isFetchingRooms ? (
              <div className="p-8 bg-secondary-50 rounded-xl border border-border flex items-center justify-center gap-2 text-text-muted">
                <Loader2 className="animate-spin" size={18} /> Searching available rooms...
              </div>
            ) : availableRooms.length === 0 ? (
              <div className="p-8 bg-warning-50 rounded-xl border border-warning-100 flex flex-col items-center justify-center gap-2 text-warning-700">
                <AlertCircle size={20} />
                <p className="font-semibold">No rooms available for these dates.</p>
                <p className="text-xs">Please adjust the check-in/check-out dates.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                {availableRooms.map(room => {
                  const isSelected = formData.roomId === room.roomId;
                  return (
                    <button
                      type="button"
                      key={room.roomId}
                      onClick={() => selectRoom(room)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected 
                          ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/20' 
                          : 'border-border bg-background hover:border-primary-300 hover:bg-secondary-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <BedDouble size={16} className={isSelected ? 'text-primary-600' : 'text-text-muted'} />
                        <span className="font-bold text-text">Room {room.roomNumber}</span>
                      </div>
                      <p className="text-xs text-text-muted">{room.roomType.typeName} • Floor {room.floor}</p>
                      <p className="text-sm font-bold text-primary-600 mt-1">
                        {parseFloat(room.roomType.basePrice).toFixed(2)} GHS / night
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pricing, Method & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Agreed Price (GHS) *</label>
              <input type="number" step="0.01" name="agreedPrice" value={formData.agreedPrice} onChange={handleChange} required readOnly={!formData.roomId}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Initial Payment (GHS)</label>
              <input type="number" step="0.01" name="amountPaid" value={formData.amountPaid} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
            </div>
            
            {/* Payment Method Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-text mb-1.5">Payment Method</label>
              <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                <option value="Cash">Cash</option>
                <option value="Card">Credit/Debit Card</option>
                <option value="MobileMoney">Mobile Money</option>
                <option value="Online">Online Transfer</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
            <input type="text" name="notes" value={formData.notes} onChange={handleChange} placeholder="Special requests..."
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
          </div>

          {/* ========================================== */}
          {/* NEW: Dynamic Booking Summary Card          */}
          {/* ========================================== */}
          {formData.agreedPrice && nights > 0 && (
            <div className="bg-secondary-50 border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-bold text-text mb-2">Booking Summary</h3>
              
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">{nights} Night(s) × {pricePerNight.toFixed(2)} GHS</span>
                <span className="font-semibold text-text">{totalCost.toFixed(2)} GHS</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Initial Payment</span>
                <span className="font-semibold text-success-600">- {amountPaid.toFixed(2)} GHS</span>
              </div>
              
              <div className="border-t border-border pt-2 flex justify-between text-base">
                <span className="font-bold text-text">Balance Due</span>
                <span className={`font-bold ${balanceDue > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                  {balanceDue.toFixed(2)} GHS
                </span>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-secondary-50/50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-100 transition">
            Cancel
          </button>
          <button type="submit" onClick={handleSubmit} disabled={isLoading || !formData.roomId}
            className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2">
            {isLoading && <Loader2 className="animate-spin" size={16} />}
            Confirm Booking
          </button>
        </div>
      </div>
    </div>
  );
}