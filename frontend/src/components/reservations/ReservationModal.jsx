import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Check, ChevronLeft, ChevronRight, User, Calendar, BedDouble, CreditCard, Building2 } from 'lucide-react';
import { getAvailableRooms } from '../../api/rooms';
import { getGuests } from '../../api/guests';
import { useAuthStore } from '../../store/authStore';

export default function ReservationModal({ isOpen, onClose, onSubmit, isLoading }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  const [currentStep, setCurrentStep] = useState(1);
  const [guests, setGuests] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isFetchingRooms, setIsFetchingRooms] = useState(false);
  
  // Unified Form State
  const [formData, setFormData] = useState({
    guestId: '',
    checkInDate: '',
    checkOutDate: '',
    source: 'Walk-in',
    notes: '',
    selectedRooms: [], // Array of room objects
    recordPayment: true,
    amountPaid: '',
    paymentMethod: 'Cash',
    gatewayReference: '',
  });

  // Reset everything when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      
      setCurrentStep(1);
      setFormData({
        guestId: '', checkInDate: today, checkOutDate: tomorrow, source: 'Walk-in', notes: '',
        selectedRooms: [], recordPayment: true, amountPaid: '', paymentMethod: 'Cash', gatewayReference: '',
      });
      setAvailableRooms([]);
      
      getGuests({ limit: 100 }).then(res => setGuests(res.data.data || [])).catch(err => console.error(err));
    }
  }, [isOpen]);

  // Fetch rooms when entering Step 2
  useEffect(() => {
    if (currentStep === 2 && formData.checkInDate && formData.checkOutDate && propertyId) {
      setIsFetchingRooms(true);
      getAvailableRooms(formData.checkInDate, formData.checkOutDate, propertyId)
        .then(res => setAvailableRooms(res.data.data || []))
        .catch(err => { console.error(err); setAvailableRooms([]); })
        .finally(() => setIsFetchingRooms(false));
    }
  }, [currentStep, formData.checkInDate, formData.checkOutDate, propertyId]);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const toggleRoomSelection = (room) => {
    const isSelected = formData.selectedRooms.some(r => r.roomId === room.roomId);
    if (isSelected) {
      setFormData({ ...formData, selectedRooms: formData.selectedRooms.filter(r => r.roomId !== room.roomId) });
    } else {
      setFormData({ ...formData, selectedRooms: [...formData.selectedRooms, room] });
    }
  };

  // Calculations
  const calculateNights = () => {
    if (formData.checkInDate && formData.checkOutDate) {
      const diff = new Date(formData.checkOutDate) - new Date(formData.checkInDate);
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
  };
  
  const nights = calculateNights();
  const totalDue = formData.selectedRooms.reduce((acc, room) => acc + (parseFloat(room.roomType.basePrice) * nights), 0);

  // Navigation & Validation
  const nextStep = () => {
    if (currentStep === 1) {
      if (!formData.guestId || !formData.checkInDate || !formData.checkOutDate) {
        alert('Please fill in Guest, Check-in, and Check-out dates.');
        return;
      }
      if (nights <= 0) {
        alert('Check-out date must be after check-in date.');
        return;
      }
    }
    if (currentStep === 2 && formData.selectedRooms.length === 0) {
      alert('Please select at least one room.');
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => setCurrentStep(prev => prev - 1);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      propertyId,
      guestId: parseInt(formData.guestId),
      staffId: user?.userId, // Handled by current logged-in user
      source: formData.source,
      checkInDate: formData.checkInDate,
      checkOutDate: formData.checkOutDate,
      notes: formData.notes,
      rooms: formData.selectedRooms.map(room => ({
        roomId: room.roomId,
        roomTypeId: room.roomTypeId,
        agreedPricePerNight: parseFloat(room.roomType.basePrice),
      })),
      amountPaid: formData.recordPayment ? parseFloat(formData.amountPaid) || 0 : 0,
      paymentMethod: formData.paymentMethod,
    };
    onSubmit(payload);
  };

  if (!isOpen) return null;

  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-4xl rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
        
        {/* Header & Stepper */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-text">New Reservation</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"><X size={20} /></button>
          </div>
          
          <div className="flex items-center justify-center gap-2">
            <StepIndicator num={1} label="Guest & Dates" active={currentStep >= 1} completed={currentStep > 1} />
            <div className={`w-12 h-0.5 ${currentStep > 1 ? 'bg-primary-500' : 'bg-border'}`} />
            <StepIndicator num={2} label="Select Rooms" active={currentStep >= 2} completed={currentStep > 2} />
            <div className={`w-12 h-0.5 ${currentStep > 2 ? 'bg-primary-500' : 'bg-border'}`} />
            <StepIndicator num={3} label="Confirm & Pay" active={currentStep >= 3} completed={false} />
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          
          {/* ========================================== */}
          {/* STEP 1: Guest & Stay Dates                 */}
          {/* ========================================== */}
          {currentStep === 1 && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Guest *</label>
                <select name="guestId" value={formData.guestId} onChange={handleChange} required
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                  <option value="">— Select an existing guest —</option>
                  {guests.map(g => <option key={g.guestId} value={g.guestId}>{g.fullName} ({g.phone})</option>)}
                </select>
                <p className="text-xs text-text-muted mt-1">Only registered guests can be booked. Add new guests from the Guests page.</p>
              </div>

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

              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2"
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition resize-none"
                  placeholder="Special requests, late check-in, etc." />
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* STEP 2: Select Rooms                       */}
          {/* ========================================== */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="bg-secondary-50 p-4 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-text">Available Rooms</h3>
                  <p className="text-xs text-text-muted">{formatDate(formData.checkInDate)} → {formatDate(formData.checkOutDate)} ({nights} Night{nights > 1 ? 's' : ''})</p>
                </div>
                <p className="text-xs font-semibold text-primary-600">Tick one or more rooms to add to this booking.</p>
              </div>

              {isFetchingRooms ? (
                <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><Loader2 className="animate-spin" size={24} /> Searching available rooms...</div>
              ) : availableRooms.length === 0 ? (
                <div className="p-12 text-center text-warning-700 bg-warning-50 rounded-xl border border-warning-100 flex flex-col items-center gap-2">
                  <AlertCircle size={24} /> <p className="font-semibold">No rooms available for these dates.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableRooms.map(room => {
                    const isSelected = formData.selectedRooms.some(r => r.roomId === room.roomId);
                    const price = parseFloat(room.roomType.basePrice);
                    const subtotal = price * nights;

                    return (
                      <button type="button" key={room.roomId} onClick={() => toggleRoomSelection(room)}
                        className={`relative p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/20' : 'border-border bg-background hover:border-primary-300 hover:bg-secondary-50'}`}>
                        
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                            <Check size={14} className="text-white" />
                          </div>
                        )}

                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-primary-100 text-primary-700' : 'bg-success-50 text-success-700'}`}>
                            {isSelected ? 'SELECTED' : 'AVAILABLE'}
                          </span>
                          <span className="text-lg font-bold text-text">{room.roomNumber}</span>
                        </div>
                        
                        <p className="text-xs text-text-muted mb-3">Floor {room.floor} · {room.roomType.typeName}</p>
                        
                        <div className="border-t border-border pt-2 mt-auto">
                          <p className="text-sm font-bold text-primary-600">GH₵ {formatCurrency(price)} / night</p>
                          <p className="text-xs text-text-muted">{nights} night{nights > 1 ? 's' : ''} = GH₵ {formatCurrency(subtotal)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================== */}
          {/* STEP 3: Confirm & Pay                      */}
          {/* ========================================== */}
          {currentStep === 3 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="bg-secondary-50 p-5 rounded-xl border border-border">
                <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-2"><Building2 size={16} /> Booking Info</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-xs text-text-muted">Guest</p><p className="font-semibold text-text">{guests.find(g => g.guestId == formData.guestId)?.fullName}</p></div>
                  <div><p className="text-xs text-text-muted">Handled By</p><p className="font-semibold text-text">{user?.fullName} ({user?.role})</p></div>
                  <div><p className="text-xs text-text-muted">Check-in</p><p className="font-semibold text-text">{formatDate(formData.checkInDate)}</p></div>
                  <div><p className="text-xs text-text-muted">Check-out</p><p className="font-semibold text-text">{formatDate(formData.checkOutDate)}</p></div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border bg-secondary-50/50">
                  <h3 className="text-sm font-bold text-text">Rooms ({formData.selectedRooms.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-secondary-50/30 text-xs text-text-muted uppercase">
                      <tr>
                        <th className="px-4 py-2">Room</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Floor</th>
                        <th className="px-4 py-2 text-right">Rate/Night</th>
                        <th className="px-4 py-2 text-center">Nights</th>
                        <th className="px-4 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.selectedRooms.map(room => (
                        <tr key={room.roomId} className="border-t border-border">
                          <td className="px-4 py-3 font-bold text-text">Room {room.roomNumber}</td>
                          <td className="px-4 py-3 text-text-muted">{room.roomType.typeName}</td>
                          <td className="px-4 py-3 text-text-muted">Floor {room.floor}</td>
                          <td className="px-4 py-3 text-right text-text">GH₵ {formatCurrency(room.roomType.basePrice)}</td>
                          <td className="px-4 py-3 text-center text-text-muted">{nights}</td>
                          <td className="px-4 py-3 text-right font-bold text-text">GH₵ {formatCurrency(parseFloat(room.roomType.basePrice) * nights)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-secondary-50/50 border-t border-border">
                        <td colSpan="5" className="px-4 py-3 text-right text-sm font-bold text-text">Total Due</td>
                        <td className="px-4 py-3 text-right text-lg font-bold text-primary-600">GH₵ {formatCurrency(totalDue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Payment Section */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="recordPayment" checked={formData.recordPayment} onChange={(e) => setFormData({...formData, recordPayment: e.target.checked, amountPaid: e.target.checked ? totalDue.toFixed(2) : '0'})}
                    className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="recordPayment" className="text-sm font-bold text-text cursor-pointer flex items-center gap-2"><CreditCard size={16} /> Record payment now</label>
                </div>

                {formData.recordPayment && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border">
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1">Amount (GH₵)</label>
                      <input type="number" step="0.01" name="amountPaid" value={formData.amountPaid} onChange={handleChange} required
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1">Payment Method</label>
                      <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                        <option value="Cash">Cash</option>
                        <option value="Card">Credit/Debit Card</option>
                        <option value="MobileMoney">Mobile Money</option>
                        <option value="Online">Online Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1">Reference (optional)</label>
                      <input type="text" name="gatewayReference" value={formData.gatewayReference} onChange={handleChange} placeholder="e.g. transaction ID"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-text-muted bg-success-50 text-success-700 p-3 rounded-lg border border-success-100">
                  <strong>Confirmed:</strong> Reservation will be saved with status Confirmed. Use the Reservations page to check in the guest.
                </p>
              </div>
            </div>
          )}
        </form>

        {/* Footer Navigation */}
        <div className="p-6 border-t border-border bg-secondary-50/50 flex justify-between">
          <button type="button" onClick={currentStep === 1 ? onClose : prevStep} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-100 transition flex items-center gap-2">
            {currentStep === 1 ? <><X size={16} /> Cancel</> : <><ChevronLeft size={16} /> Back</>}
          </button>
          
          {currentStep < 3 ? (
            <button type="button" onClick={nextStep} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition flex items-center gap-2">
              Next: {currentStep === 1 ? 'Select Rooms' : 'Confirm'} <ChevronRight size={16} />
            </button>
          ) : (
            <button type="submit" onClick={handleSubmit} disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-success-600 rounded-lg hover:bg-success-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              <Check size={16} /> Save Reservation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Stepper Indicator Component
function StepIndicator({ num, label, active, completed }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
        completed ? 'bg-primary-600 text-white' : 
        active ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500/20' : 
        'bg-secondary-100 text-text-muted'
      }`}>
        {completed ? <Check size={14} /> : num}
      </div>
      <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-text' : 'text-text-muted'}`}>{label}</span>
    </div>
  );
}