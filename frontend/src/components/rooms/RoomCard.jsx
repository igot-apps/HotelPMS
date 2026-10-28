import { useState } from 'react';
import { BedDouble, Users, Sparkles, AlertTriangle, Wrench, ArrowRightLeft, Phone, UserRound, Clock, LogIn, LogOut, Loader2 } from 'lucide-react';

export default function RoomCard({ room, onToggleHousekeeping, onToggleOperational, isUpdating, isPresenceUpdating, onSetGuestPresence }) {
  const [isMarkingOut, setIsMarkingOut] = useState(false);
  const [expectedReturnInput, setExpectedReturnInput] = useState('');
  const opStatus = room.operationalStatus?.toUpperCase();
  const hkStatus = room.housekeepingStatus?.toUpperCase();
  const activeStay = room.reservationRooms?.[0];
  const reservation = activeStay?.reservation;
  const occupantName = activeStay?.occupantName
    || reservation?.guestNameSnapshot
    || reservation?.propertyGuest?.fullName
    || reservation?.platformGuest?.fullName;
  const occupantPhone = activeStay?.occupantPhone
    || reservation?.guestPhoneSnapshot
    || reservation?.propertyGuest?.phone
    || reservation?.platformGuest?.phone;

  // 1. Determine Visual Styles based on Operational Status
  let borderColor = 'border-border';
  let statusBadgeClass = 'bg-secondary-100 text-secondary-700';
  let statusIcon = null;

  if (opStatus === 'AVAILABLE') {
    borderColor = 'border-l-4 border-l-success-500 border-t border-r border-b border-border';
    statusBadgeClass = 'bg-success-50 text-success-700 ring-1 ring-success-600/20';
  } else if (opStatus === 'OCCUPIED') {
    borderColor = 'border-l-4 border-l-primary-500 border-t border-r border-b border-border';
    statusBadgeClass = 'bg-primary-50 text-primary-700 ring-1 ring-primary-600/20';
  } else if (opStatus === 'MAINTENANCE') {
    borderColor = 'border-l-4 border-l-danger-500 border-t border-r border-b border-border';
    statusBadgeClass = 'bg-danger-50 text-danger-700 ring-1 ring-danger-600/20';
    statusIcon = <Wrench size={12} />;
  }

  // 2. Housekeeping Visuals
  let hkBadgeClass = 'bg-secondary-50 text-secondary-600';
  let hkIcon = <Sparkles size={14} className="text-success-500" />;
  let hkLabel = 'Clean';
  
  if (hkStatus === 'DIRTY') {
    hkBadgeClass = 'bg-warning-50 text-warning-700';
    hkIcon = <AlertTriangle size={14} className="text-warning-500" />;
    hkLabel = 'Needs Cleaning';
  } else if (hkStatus === 'OUTOFSERVICE') {
    hkBadgeClass = 'bg-danger-50 text-danger-700';
    hkIcon = <Wrench size={14} className="text-danger-500" />;
    hkLabel = 'Out of Service';
  }

  const hkBtnText = hkStatus === 'CLEAN' ? 'Mark Dirty' : 'Mark Clean';
  const opBtnText = opStatus === 'MAINTENANCE' ? 'Set Available' : 'Set Maintenance';

  return (
    <div className={`bg-surface rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${borderColor} group`}>
      
      {/* Card Header */}
      <div className="p-5 pb-3">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-2xl font-bold text-text tracking-tight">
              {room.roomNumber}
            </h3>
            <p className="text-sm text-text-muted font-medium mt-0.5">
              {room.roomType?.typeName || 'Standard Room'}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${statusBadgeClass}`}>
            {statusIcon} {opStatus}
          </span>
        </div>

        {/* Room Features */}
        <div className="flex items-center gap-4 text-text-muted mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <BedDouble size={14} /> 
            <span>Floor {room.floor || '-'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Users size={14} /> 
            <span>Max {room.roomType?.maxOccupancy || 2} Guests</span>
          </div>
        </div>

        {/* Housekeeping Status */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${hkBadgeClass}`}>
          {hkIcon}
          <span className="text-xs font-semibold">{hkLabel}</span>
        </div>

        {opStatus === 'OCCUPIED' && (
          <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary-700">Current Occupant</p>
              {activeStay && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeStay.guestPresenceStatus === 'Out' ? 'bg-warning-100 text-warning-800' : 'bg-success-100 text-success-800'}`}>
                  {activeStay.guestPresenceStatus === 'Out' ? 'OUT' : 'IN ROOM'}
                </span>
              )}
            </div>
            {occupantName || occupantPhone ? (
              <div className="space-y-1">
                {occupantName && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-text">
                    <UserRound size={14} className="text-primary-600 shrink-0" />
                    <span className="truncate">{occupantName}</span>
                  </p>
                )}
                {occupantPhone && (
                  <a href={`tel:${occupantPhone}`} className="flex items-center gap-2 text-sm text-primary-700 hover:underline">
                    <Phone size={14} className="shrink-0" />
                    <span>{occupantPhone}</span>
                  </a>
                )}
                <p className="pt-1 text-[11px] text-text-muted">Check out the guest before setting this room to maintenance.</p>
                {activeStay?.guestPresenceStatus === 'Out' && activeStay.guestOutAt && (
                  <p className="flex items-center gap-1.5 pt-1 text-xs text-warning-800">
                    <Clock size={12} /> Out since {new Date(activeStay.guestOutAt).toLocaleString()}
                  </p>
                )}
                {activeStay?.guestPresenceStatus === 'Out' && activeStay.expectedReturnAt && (
                  <p className="text-xs text-text-muted">Expected back {new Date(activeStay.expectedReturnAt).toLocaleString()}</p>
                )}
                {activeStay?.guestPresenceStatus !== 'Out' && activeStay?.guestReturnedAt && (
                  <p className="flex items-center gap-1.5 pt-1 text-xs text-success-700">
                    <Clock size={12} /> Returned at {new Date(activeStay.guestReturnedAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-text-muted">Occupant details not recorded</p>
            )}
            {activeStay && (
              <div className="mt-2 border-t border-primary-100 pt-2">
                {activeStay.guestPresenceStatus === 'Out' ? (
                  <button
                    type="button"
                    disabled={isPresenceUpdating}
                    onClick={() => onSetGuestPresence(activeStay.reservationRoomId, 'returned')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-success-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-success-700 disabled:opacity-60"
                  >
                    {isPresenceUpdating ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
                    Mark Returned
                  </button>
                ) : isMarkingOut ? (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-medium text-text-muted">Expected return (optional)</label>
                    <input
                      type="datetime-local"
                      min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                      value={expectedReturnInput}
                      onChange={(event) => setExpectedReturnInput(event.target.value)}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isPresenceUpdating}
                        onClick={() => {
                          onSetGuestPresence(activeStay.reservationRoomId, 'out', expectedReturnInput ? new Date(expectedReturnInput).toISOString() : undefined);
                          setIsMarkingOut(false);
                          setExpectedReturnInput('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md bg-warning-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-warning-700 disabled:opacity-60"
                      >
                        {isPresenceUpdating ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                        Confirm Out
                      </button>
                      <button
                        type="button"
                        disabled={isPresenceUpdating}
                        onClick={() => { setIsMarkingOut(false); setExpectedReturnInput(''); }}
                        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-muted hover:bg-secondary-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isPresenceUpdating}
                    onClick={() => setIsMarkingOut(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-warning-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-warning-800 hover:bg-warning-50 disabled:opacity-60"
                  >
                    <LogOut size={13} /> Mark Guest Out
                  </button>
                )}
                {activeStay.presenceUpdatedByUser?.fullName && (
                  <p className="mt-1.5 text-[10px] text-text-muted">Last updated by {activeStay.presenceUpdatedByUser.fullName}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="px-5 py-4 bg-secondary-50/50 border-t border-border flex gap-2">
        <button
          onClick={() => onToggleHousekeeping(room)}
          disabled={isUpdating || opStatus === 'MAINTENANCE'}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-surface border border-border text-text hover:bg-secondary-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles size={14} /> {hkBtnText}
        </button>
        <button
          onClick={() => onToggleOperational(room)}
          disabled={isUpdating || opStatus === 'OCCUPIED'}
          title={opStatus === 'OCCUPIED' ? 'Check out the guest before setting this room to maintenance' : undefined}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-surface border border-border text-text hover:bg-secondary-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowRightLeft size={14} /> {opBtnText}
        </button>
      </div>
    </div>
  );
}
