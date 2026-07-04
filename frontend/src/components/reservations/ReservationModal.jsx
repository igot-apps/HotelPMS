import { useState, useEffect, useRef } from 'react'; 
import { X, Loader2, AlertCircle, Check, ChevronLeft, ChevronRight, CreditCard, UserPlus } from 'lucide-react';
import { getAvailableRooms } from '../../api/rooms';
import { getGuests, createGuest } from '../../api/guests'; // Added createGuest
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast'; // For success feedback


export default function ReservationModal({ isOpen, onClose, onSubmit, isLoading }) {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;

  const [currentStep, setCurrentStep] = useState(1);
  const [guests, setGuests] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isFetchingRooms, setIsFetchingRooms] = useState(false);
  
  // NEW: Quick Add Guest States
  const [isAddGuestOpen, setIsAddGuestOpen] = useState(false);
  const [isSavingGuest, setIsSavingGuest] = useState(false);
  const [newGuestData, setNewGuestData] = useState({
    fullName: '', phone: '', email: '', idNumber: ''
  });

  const [formData, setFormData] = useState({
    guestId: '', checkInDate: '', checkOutDate: '', source: 'Walk-in', notes: '',
    selectedRooms: [], recordPayment: true, amountPaid: '', paymentMethod: 'Cash', gatewayReference: '',
  });

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

  const calculateNights = () => {
    if (formData.checkInDate && formData.checkOutDate) {
      const diff = new Date(formData.checkOutDate) - new Date(formData.checkInDate);
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
  };
  
  const nights = calculateNights();
  const totalDue = formData.selectedRooms.reduce((acc, room) => acc + (parseFloat(room.roomType.basePrice) * nights), 0);

  // ==========================================
  // NEW: Quick Add Guest Handler
  // ==========================================
  const handleQuickAddGuest = async (e) => {
    e.preventDefault();
    if (!newGuestData.fullName || !newGuestData.phone) {
      toast.error('Full Name and Phone are required.');
      return;
    }

    setIsSavingGuest(true);
    try {
      // 1. Create the guest via API
      const res = await createGuest(newGuestData);
      const createdGuest = res.data.data;
      
      // 2. Add to the top of the local dropdown list
      setGuests(prev => [createdGuest, ...prev]);
      
      // 3. AUTO-SELECT the newly created guest in the main form
      setFormData(prev => ({ ...prev, guestId: String(createdGuest.guestId) }));
      
      // 4. Close modal and reset
      setIsAddGuestOpen(false);
      setNewGuestData({ fullName: '', phone: '', email: '', idNumber: '' });
      
      toast.success(`${createdGuest.fullName} added and selected!`);
    } catch (err) {
      // The global Axios interceptor will show the error toast (e.g., "Phone already exists")
      console.error('Failed to create guest:', err);
    } finally {
      setIsSavingGuest(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!formData.guestId || !formData.checkInDate || !formData.checkOutDate) {
        toast.error('Please fill in Guest, Check-in, and Check-out dates.'); return;
      }
      if (nights <= 0) { toast.error('Check-out date must be after check-in date.'); return; }
    }
    if (currentStep === 2 && formData.selectedRooms.length === 0) {
      toast.error('Please select at least one room.'); return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => setCurrentStep(prev => prev - 1);

  const handleSubmit = (e) => {
    e.preventDefault();
    const exactTotal = parseFloat(totalDue.toFixed(2));
    const exactPaid = formData.recordPayment ? parseFloat(parseFloat(formData.amountPaid || 0).toFixed(2)) : 0;

    const payload = {
      propertyId, guestId: parseInt(formData.guestId), staffId: user?.userId, source: formData.source,
      checkInDate: formData.checkInDate, checkOutDate: formData.checkOutDate, notes: formData.notes,
      rooms: formData.selectedRooms.map(room => ({
        roomId: room.roomId, roomTypeId: room.roomTypeId, agreedPricePerNight: parseFloat(room.roomType.basePrice),
      })),
      amountPaid: 0, initialPayment: exactPaid, paymentMethod: formData.paymentMethod, gatewayReference: formData.gatewayReference || null,
    };
    onSubmit(payload);
  };

  if (!isOpen) return null;

  const formatCurrency = (val) => parseFloat(val || 0).toFixed(2);
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-4xl rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] flex flex-col">
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {currentStep === 1 && (
            <div className="space-y-5 max-w-2xl mx-auto">
                            <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Guest *</label>
                <div className="flex gap-2">
                  {/* NEW: Searchable Guest Combobox */}
                  <SearchableGuestSelect 
                    guests={guests} 
                    value={formData.guestId} 
                    onChange={(id) => setFormData(prev => ({ ...prev, guestId: id }))} 
                  />
                  
                  {/* Quick Add Guest Button */}
                  <button 
                    type="button" 
                    onClick={() => setIsAddGuestOpen(true)} 
                    className="px-4 py-2.5 bg-primary-50 text-primary-600 border border-primary-100 rounded-lg hover:bg-primary-100 transition flex items-center gap-2 font-semibold text-sm whitespace-nowrap"
                    title="Add New Guest"
                  >
                    <UserPlus size={18} /> Add Guest
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1">Search by name or phone. Click "Add Guest" to quickly create a new profile.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Check-in Date *</label>
                  <input type="date" name="checkInDate" value={formData.checkInDate} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-text mb-1.5">Check-out Date *</label>
                  <input type="date" name="checkOutDate" value={formData.checkOutDate} onChange={handleChange} required className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Booking Source</label>
                <select name="source" value={formData.source} onChange={handleChange} className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition">
                  <option value="Walk-in">Walk-in</option><option value="Phone">Phone</option><option value="Website">Website</option><option value="Direct">Direct</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-text mb-1.5">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows="2" className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition resize-none" placeholder="Special requests..." />
              </div>
            </div>
          )}

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
                <div className="p-12 text-center text-text-muted flex flex-col items-center gap-2"><Loader2 className="animate-spin" size={24} /> Searching...</div>
              ) : availableRooms.length === 0 ? (
                <div className="p-12 text-center text-warning-700 bg-warning-50 rounded-xl border border-warning-100 flex flex-col items-center gap-2"><AlertCircle size={24} /> <p className="font-semibold">No rooms available.</p></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableRooms.map(room => {
                    const isSelected = formData.selectedRooms.some(r => r.roomId === room.roomId);
                    const price = parseFloat(room.roomType.basePrice);
                    return (
                      <button type="button" key={room.roomId} onClick={() => toggleRoomSelection(room)} className={`relative p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/20' : 'border-border bg-background hover:border-primary-300 hover:bg-secondary-50'}`}>
                        {isSelected && <div className="absolute top-2 right-2 w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center"><Check size={14} className="text-white" /></div>}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-primary-100 text-primary-700' : 'bg-success-50 text-success-700'}`}>{isSelected ? 'SELECTED' : 'AVAILABLE'}</span>
                          <span className="text-lg font-bold text-text">{room.roomNumber}</span>
                        </div>
                        <p className="text-xs text-text-muted mb-3">Floor {room.floor} · {room.roomType.typeName}</p>
                        <div className="border-t border-border pt-2 mt-auto">
                          <p className="text-sm font-bold text-primary-600">GH₵ {formatCurrency(price)} / night</p>
                          <p className="text-xs text-text-muted">{nights} night{nights > 1 ? 's' : ''} = GH₵ {formatCurrency(price * nights)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="bg-secondary-50 p-5 rounded-xl border border-border">
                <h3 className="text-sm font-bold text-text mb-3">Booking Info</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-xs text-text-muted">Guest</p><p className="font-semibold text-text">{guests.find(g => g.guestId == formData.guestId)?.fullName}</p></div>
                  <div><p className="text-xs text-text-muted">Handled By</p><p className="font-semibold text-text">{user?.fullName}</p></div>
                  <div><p className="text-xs text-text-muted">Check-in</p><p className="font-semibold text-text">{formatDate(formData.checkInDate)}</p></div>
                  <div><p className="text-xs text-text-muted">Check-out</p><p className="font-semibold text-text">{formatDate(formData.checkOutDate)}</p></div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border bg-secondary-50/50"><h3 className="text-sm font-bold text-text">Rooms ({formData.selectedRooms.length})</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-secondary-50/30 text-xs text-text-muted uppercase">
                      <tr><th className="px-4 py-2">Room</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {formData.selectedRooms.map(room => (
                        <tr key={room.roomId} className="border-t border-border">
                          <td className="px-4 py-3 font-bold text-text">Room {room.roomNumber}</td>
                          <td className="px-4 py-3 text-text-muted">{room.roomType.typeName}</td>
                          <td className="px-4 py-3 text-right text-text">{formatCurrency(room.roomType.basePrice)}</td>
                          <td className="px-4 py-3 text-right font-bold text-text">{formatCurrency(parseFloat(room.roomType.basePrice) * nights)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-secondary-50/50 border-t border-border">
                        <td colSpan="3" className="px-4 py-3 text-right text-sm font-bold text-text">Total Due</td>
                        <td className="px-4 py-3 text-right text-lg font-bold text-primary-600">GH₵ {formatCurrency(totalDue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="recordPayment" checked={formData.recordPayment} onChange={(e) => setFormData({ ...formData, recordPayment: e.target.checked, amountPaid: e.target.checked ? totalDue.toFixed(2) : '0' })} className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
                  <label htmlFor="recordPayment" className="text-sm font-bold text-text cursor-pointer flex items-center gap-2"><CreditCard size={16} /> Record Initial Payment now</label>
                </div>

                {formData.recordPayment && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">Initial Payment Amount (GH₵)</label>
                        <input type="number" step="0.01" name="amountPaid" value={formData.amountPaid} onChange={handleChange} required className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">Payment Method</label>
                        <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20">
                          <option value="Cash">Cash</option><option value="Card">Card</option><option value="MobileMoney">Mobile Money</option><option value="Online">Online</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">Reference (optional)</label>
                        <input type="text" name="gatewayReference" value={formData.gatewayReference} onChange={handleChange} placeholder="e.g. transaction ID" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-secondary-50 rounded-lg border border-border">
                      <span className="text-sm font-semibold text-text">Remaining Balance to Collect:</span>
                      {(() => {
                        const paid = parseFloat(formData.amountPaid || 0);
                        const remaining = totalDue - paid;
                        const isOverdue = remaining > 0.01; 
                        return (
                          <span className={`text-lg font-bold ${isOverdue ? 'text-danger-600' : 'text-success-600'}`}>
                            GH₵ {formatCurrency(Math.max(0, remaining))}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>

        <div className="p-6 border-t border-border bg-secondary-50/50 flex justify-between">
          <button type="button" onClick={currentStep === 1 ? onClose : prevStep} className="px-5 py-2.5 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-100 transition flex items-center gap-2">
            {currentStep === 1 ? <><X size={16} /> Cancel</> : <><ChevronLeft size={16} /> Back</>}
          </button>
          {currentStep < 3 ? (
            <button type="button" onClick={nextStep} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 transition flex items-center gap-2">
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button type="submit" onClick={handleSubmit} disabled={isLoading} className="px-5 py-2.5 text-sm font-semibold text-text-inverted bg-success-600 rounded-lg hover:bg-success-700 transition disabled:opacity-50 flex items-center gap-2">
              {isLoading && <Loader2 className="animate-spin" size={16} />} <Check size={16} /> Save Reservation
            </button>
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* NEW: Nested Quick Add Guest Modal          */}
      {/* ========================================== */}
      {isAddGuestOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-primary-50/30">
              <h3 className="text-lg font-bold text-text flex items-center gap-2"><UserPlus size={20} className="text-primary-600" /> Quick Add Guest</h3>
              <button type="button" onClick={() => setIsAddGuestOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 text-text-muted transition"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleQuickAddGuest} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Full Name *</label>
                <input type="text" value={newGuestData.fullName} onChange={(e) => setNewGuestData({...newGuestData, fullName: e.target.value})} required placeholder="e.g. Kwame Asante"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Phone Number *</label>
                  <input type="tel" value={newGuestData.phone} onChange={(e) => setNewGuestData({...newGuestData, phone: e.target.value})} required placeholder="0244123456"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">ID Number</label>
                  <input type="text" value={newGuestData.idNumber} onChange={(e) => setNewGuestData({...newGuestData, idNumber: e.target.value})} placeholder="GHA-001"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Email Address</label>
                <input type="email" value={newGuestData.email} onChange={(e) => setNewGuestData({...newGuestData, email: e.target.value})} placeholder="guest@email.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text outline-none focus:ring-2 focus:ring-primary-500/20" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button type="button" onClick={() => setIsAddGuestOpen(false)} className="px-4 py-2 text-sm font-semibold text-text bg-surface border border-border rounded-lg hover:bg-secondary-50">Cancel</button>
                <button type="submit" disabled={isSavingGuest} className="px-4 py-2 text-sm font-semibold text-text-inverted bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
                  {isSavingGuest && <Loader2 className="animate-spin" size={14} />} Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ num, label, active, completed }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${completed ? 'bg-primary-600 text-white' : active ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500/20' : 'bg-secondary-100 text-text-muted'}`}>
        {completed ? <Check size={14} /> : num}
      </div>
      <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-text' : 'text-text-muted'}`}>{label}</span>
    </div>
  );
}


// ==========================================
// Custom Searchable Guest Dropdown
// ==========================================
function SearchableGuestSelect({ guests, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);

  // Filter guests based on search term (Name or Phone)
  const filteredGuests = guests.filter(g => 
    g.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.phone && g.phone.includes(searchTerm))
  );

  // Find the currently selected guest to display their name
  const selectedGuest = guests.find(g => String(g.guestId) === String(value));

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        // Reset search term when closing so the input shows the selected name cleanly
        setSearchTerm(''); 
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (guestId) => {
    onChange(String(guestId));
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <input
        type="text"
        // Show search term while typing, otherwise show selected guest's name
        value={isOpen ? searchTerm : (selectedGuest ? `${selectedGuest.fullName} (${selectedGuest.phone})` : '')}
        onChange={(e) => { 
          setSearchTerm(e.target.value); 
          if (!isOpen) setIsOpen(true);
          // If they delete the text, clear the selection
          if (!e.target.value) onChange(''); 
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search by name or phone..."
        className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text placeholder:text-text-muted focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition"
      />
      
      {/* Dropdown List */}
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-surface border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filteredGuests.length > 0 ? (
            filteredGuests.map(g => (
              <button
                key={g.guestId}
                type="button"
                onClick={() => handleSelect(g.guestId)}
                className={`w-full text-left px-4 py-2.5 text-sm transition flex justify-between items-center ${
                  String(g.guestId) === String(value) 
                    ? 'bg-primary-50 text-primary-700 font-semibold' 
                    : 'text-text hover:bg-secondary-50'
                }`}
              >
                <span>{g.fullName}</span>
                <span className="text-xs text-text-muted">{g.phone}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-text-muted text-center">
              No guests found. <br/>
              <button type="button" onClick={() => setIsOpen(false)} className="text-primary-600 font-semibold hover:underline mt-1">
                Click "Add Guest" to create one.
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}