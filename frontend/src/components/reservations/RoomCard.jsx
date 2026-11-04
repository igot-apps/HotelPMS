import { Link } from 'react-router-dom';
import { LogIn, LogOut, Loader2, Clock, Pencil } from 'lucide-react';

export default function RoomCard({ 
  rr, 
  res, 
  isThisRoomBusy, 
  isUpdatingOccupant,
  onCheckIn, 
  onCheckOut, 
  onExtend,
  onEditOccupant
}) {
  const roomStatus = rr.status || 'Reserved';
  // 🌟 Check if room lifecycle is complete (CheckedOut)
  const isRoomComplete = roomStatus === 'CheckedOut';
  
  let roomActionBtn = null;
  
  // 🌟 Only show action buttons if room is NOT CheckedOut
  if (!isRoomComplete) {
    if (roomStatus === 'Reserved') {
      roomActionBtn = (
        <button
          disabled={isThisRoomBusy}
          onClick={() => onCheckIn(rr)}
          className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-success-600 text-text-inverted hover:bg-success-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isThisRoomBusy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />} Check In Room
        </button>
      );
    } else if (roomStatus === 'CheckedIn') {
      roomActionBtn = (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            disabled={isThisRoomBusy}
            onClick={() => onCheckOut(rr)}
            className="inline-flex min-h-11 flex-1 sm:flex-initial items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary-600 text-text-inverted hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isThisRoomBusy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />} Check Out Room
          </button>
          
          <button
            disabled={isThisRoomBusy}
            onClick={() => onExtend(rr)}
            className="inline-flex min-h-11 flex-1 sm:flex-initial items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-warning-600 text-text-inverted hover:bg-warning-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Clock size={14} /> Extend
          </button>
        </div>
      );
    }
  }

  return (
    <div className={`bg-surface p-4 rounded-xl border shadow-sm flex flex-col gap-3 ${
      isRoomComplete ? 'border-secondary-200 opacity-75' : 'border-border'
    }`}>
      <Link to={`/reservations/${res.reservationId}`} className="text-xs font-semibold text-primary-600 hover:underline">Open reservation / correct or undo actions</Link>
      {/* Room Header */}
      <div className="flex justify-between items-start">
        <div>
          <p className="text-lg font-bold text-text">Room {rr.room?.roomNumber || rr.roomNumberSnapshot || 'Removed'}</p>
          <p className="text-xs text-text-muted">{rr.room?.roomType?.typeName || rr.roomTypeNameSnapshot || 'Room type removed'}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
          roomStatus === 'CheckedIn' ? 'bg-success-50 text-success-700' :
          roomStatus === 'CheckedOut' ? 'bg-secondary-100 text-secondary-700' :
          'bg-primary-50 text-primary-700'
        }`}>
          {roomStatus}
        </span>
      </div>

      {/* Actual Check-in/Check-out Times */}
      {(rr.actualCheckIn || rr.actualCheckOut) && (
        <div className="space-y-2 pt-3 border-t border-border">
          {rr.actualCheckIn && (
            <div className="flex items-start gap-2">
              <LogIn size={14} className="text-success-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-text">Checked In</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-text-muted">
                    {new Date(rr.actualCheckIn).toLocaleString('en-US', { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                  {(() => {
                    const actual = new Date(rr.actualCheckIn);
                    const scheduled = new Date(rr.checkInDate);
                    const actualDateOnly = new Date(actual.getFullYear(), actual.getMonth(), actual.getDate());
                    const scheduledDateOnly = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
                    const dayDiff = Math.round((actualDateOnly.getTime() - scheduledDateOnly.getTime()) / (1000 * 60 * 60 * 24));
                    if (dayDiff > 0) {
                      return <span className="text-[10px] font-bold text-danger-700 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">{dayDiff} day{dayDiff !== 1 ? 's' : ''} late</span>;
                    } else if (dayDiff < 0) {
                      return <span className="text-[10px] font-bold text-warning-700 bg-warning-50 px-1.5 py-0.5 rounded border border-warning-200">{Math.abs(dayDiff)} day{Math.abs(dayDiff) !== 1 ? 's' : ''} early</span>;
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          )}
          {rr.actualCheckOut && (
            <div className="flex items-start gap-2">
              <LogOut size={14} className="text-primary-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-text">Checked Out</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-text-muted">
                    {new Date(rr.actualCheckOut).toLocaleString('en-US', { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                  {(() => {
                    const actual = new Date(rr.actualCheckOut);
                    const scheduled = new Date(rr.checkOutDate);
                    const actualDateOnly = new Date(actual.getFullYear(), actual.getMonth(), actual.getDate());
                    const scheduledDateOnly = new Date(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
                    const dayDiff = Math.round((actualDateOnly.getTime() - scheduledDateOnly.getTime()) / (1000 * 60 * 60 * 24));
                    if (dayDiff > 0) {
                      return <span className="text-[10px] font-bold text-danger-700 bg-danger-50 px-1.5 py-0.5 rounded border border-danger-200">{dayDiff} day{dayDiff !== 1 ? 's' : ''} late</span>;
                    } else if (dayDiff < 0) {
                      return <span className="text-[10px] font-bold text-success-700 bg-success-50 px-1.5 py-0.5 rounded border border-success-200">{Math.abs(dayDiff)} day{Math.abs(dayDiff) !== 1 ? 's' : ''} early</span>;
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          )}
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

      <div className="pt-3 border-t border-border">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs text-text-muted">Room occupant</p>
          {['Reserved', 'CheckedIn'].includes(roomStatus) && <button disabled={isUpdatingOccupant || isThisRoomBusy} onClick={() => onEditOccupant(rr)} className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-primary-600 disabled:opacity-50" title="Edit room occupant"><Pencil size={12} />{rr.occupantName ? 'Edit' : 'Add occupant'}</button>}
        </div>
        <p className="text-sm font-semibold text-text">{rr.occupantName || <span className="font-normal italic text-text-muted">Not assigned</span>}</p>
        {rr.occupantPhone && <p className="text-xs text-text-muted">{rr.occupantPhone}</p>}
      </div>

      {/* Price and Action Button */}
      <div className="pt-3 border-t border-border flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:flex-wrap sm:justify-between mt-auto">
        <p className="text-sm font-bold text-primary-600">{parseFloat(rr.agreedPricePerNight).toFixed(2)} GHS <span className="font-normal text-text-muted">per night</span></p>
        {roomActionBtn || (
          isRoomComplete ? (
            <span className="text-xs text-text-muted font-semibold italic">Completed</span>
          ) : (
            <span className="text-xs text-text-muted font-semibold">No actions</span>
          )
        )}
      </div>
    </div>
  );
}
