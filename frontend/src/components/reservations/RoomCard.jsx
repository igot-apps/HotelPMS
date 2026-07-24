import { LogIn, LogOut, Loader2, Clock } from 'lucide-react';

export default function RoomCard({ 
  rr, 
  res, 
  isThisRoomBusy, 
  onCheckIn, 
  onCheckOut, 
  onExtend 
}) {
  const roomStatus = rr.status || 'Reserved';
  
  // Determine which action button to show
  let roomActionBtn = null;
  
  if (roomStatus === 'Reserved') {
    const mainGuestName = res.platformGuest?.fullName || res.propertyGuest?.fullName || '';
    roomActionBtn = (
      <button
        disabled={isThisRoomBusy}
        onClick={() => onCheckIn(rr, mainGuestName)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-success-600 text-text-inverted hover:bg-success-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isThisRoomBusy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Check In Room
      </button>
    );
  } else if (roomStatus === 'CheckedIn') {
    roomActionBtn = (
      <div className="flex gap-2">
        <button
          disabled={isThisRoomBusy}
          onClick={() => onCheckOut(rr)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-text-inverted hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isThisRoomBusy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Check Out Room
        </button>
        
        <button
          disabled={isThisRoomBusy}
          onClick={() => onExtend(rr)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-warning-600 text-text-inverted hover:bg-warning-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Clock size={14} /> Extend
        </button>
      </div>
    );
  }

  // 🌟 Helper: Compare two dates ignoring time, return difference in days
  const getDateDiffInDays = (date1, date2) => {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3">
      {/* Room Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="text-lg font-bold text-text">Room {rr.room?.roomNumber}</p>
          <p className="text-xs text-text-muted">{rr.room?.roomType?.typeName}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
          roomStatus === 'CheckedIn' ? 'bg-success-50 text-success-700' :
          roomStatus === 'CheckedOut' ? 'bg-secondary-100 text-secondary-700' :
          'bg-primary-50 text-primary-700'
        }`}>
          {roomStatus}
        </span>
      </div>

      {/* Actual Check-in/Check-out Times with Early/Late Indicators (DATE-ONLY comparison) */}
      {(rr.actualCheckIn || rr.actualCheckOut) && (
        <div className="space-y-2 pt-3 border-t border-border">
          {/* Check-in */}
          {rr.actualCheckIn && (() => {
            const actual = new Date(rr.actualCheckIn);
            const scheduled = new Date(rr.checkInDate);
            const dayDiff = getDateDiffInDays(actual, scheduled); // positive = late, negative = early
            
            return (
              <div className="flex items-start gap-2">
                <LogIn size={14} className="text-success-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-text">Checked In</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-text-muted">
                      {actual.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {dayDiff > 0 && (
                      <span className="text-[10px] font-bold text-danger-700 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">
                        {dayDiff} day{dayDiff !== 1 ? 's' : ''} late
                      </span>
                    )}
                    {dayDiff < 0 && (
                      <span className="text-[10px] font-bold text-warning-700 bg-warning-50 px-1.5 py-0.5 rounded border border-warning-200">
                        {Math.abs(dayDiff)} day{Math.abs(dayDiff) !== 1 ? 's' : ''} early
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Check-out */}
          {rr.actualCheckOut && (() => {
            const actual = new Date(rr.actualCheckOut);
            const scheduled = new Date(rr.checkOutDate);
            const dayDiff = getDateDiffInDays(actual, scheduled); // positive = late, negative = early
            
            return (
              <div className="flex items-start gap-2">
                <LogOut size={14} className="text-primary-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-text">Checked Out</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-text-muted">
                      {actual.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {dayDiff > 0 && (
                      <span className="text-[10px] font-bold text-danger-700 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">
                        {dayDiff} day{dayDiff !== 1 ? 's' : ''} late
                      </span>
                    )}
                    {dayDiff < 0 && (
                      <span className="text-[10px] font-bold text-success-700 bg-success-50 px-1.5 py-0.5 rounded border border-success-200">
                        {Math.abs(dayDiff)} day{Math.abs(dayDiff) !== 1 ? 's' : ''} early
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Extended Stay Indicator */}
      {rr.originalCheckOutDate && (
        <div className="flex items-start gap-2 p-2.5 bg-primary-50 border border-primary-200 rounded-lg mt-3 mb-3">
          <Clock size={14} className="text-primary-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-primary-700">Stay Extended</p>
            <p className="text-xs text-primary-600">
              Original: {new Date(rr.originalCheckOutDate).toLocaleDateString()} 
              <span className="mx-1">→</span> 
              New: {new Date(rr.checkOutDate).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {/* Occupant Name */}
      <div className="pt-3 border-t border-border">
        <p className="text-xs text-text-muted mb-1">Occupant Name</p>
        <p className="text-sm font-semibold text-text">{rr.occupantName || 'Not assigned'}</p>
      </div>

      {/* Price and Action Button */}
      <div className="pt-3 border-t border-border flex items-center justify-between mt-auto">
        <p className="text-sm font-bold text-primary-600">{parseFloat(rr.agreedPricePerNight).toFixed(2)} GHS</p>
        {roomActionBtn || <span className="text-xs text-text-muted font-semibold">No actions</span>}
      </div>
    </div>
  );
}