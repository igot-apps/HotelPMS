import { BedDouble, Users, Sparkles, AlertTriangle, Wrench, ArrowRightLeft } from 'lucide-react';

export default function RoomCard({ room, onToggleHousekeeping, onToggleOperational, isUpdating }) {
  const opStatus = room.operationalStatus?.toUpperCase();
  const hkStatus = room.housekeepingStatus?.toUpperCase();

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
          disabled={isUpdating}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-surface border border-border text-text hover:bg-secondary-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowRightLeft size={14} /> {opBtnText}
        </button>
      </div>
    </div>
  );
}