import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReservationsByDateRange } from '../api/reservations';
import { useAuthStore } from '../store/authStore';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CalendarPage() {
  const user = useAuthStore((state) => state.user);
  const propertyId = user?.propertyId;
  
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed

  // Calculate first and last day of the month for the API
  const fromDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
  const toDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

  const { data, isLoading } = useQuery({
    queryKey: ['calendarReservations', propertyId, fromDate, toDate],
    queryFn: () => getReservationsByDateRange(fromDate, toDate, propertyId).then(res => res.data.data),
    enabled: !!propertyId,
  });

  const reservations = data || [];

  // Helper to get days in month and starting day
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday

  const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  // Map reservations to specific days
  const reservationsByDay = useMemo(() => {
    const map = {};
    reservations.forEach(res => {
      const start = new Date(res.checkInDate);
      const end = new Date(res.checkOutDate);
      
      // Loop through each day the reservation occupies
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          const dayNum = d.getDate();
          if (!map[dayNum]) map[dayNum] = [];
          map[dayNum].push(res);
        }
      }
    });
    return map;
  }, [reservations, currentMonth, currentYear]);

  const getStatusColor = (status) => {
    if (status === 'CheckedIn') return 'bg-success-500 text-white';
    if (status === 'Confirmed') return 'bg-primary-500 text-white';
    if (status === 'Cancelled') return 'bg-danger-500 text-white';
    return 'bg-secondary-400 text-white'; // CheckedOut
  };

  return (
    <div className="space-y-6">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2"><CalendarDays size={24} /> Calendar View</h1>
          <p className="text-text-muted text-sm mt-1">Visual overview of reservations for the month.</p>
        </div>
        <div className="flex items-center gap-2 bg-surface p-1 rounded-xl border border-border shadow-sm">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"><ChevronLeft size={20} /></button>
          <span className="px-4 text-sm font-bold text-text min-w-[140px] text-center">{monthName} {currentYear}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-secondary-100 text-text-muted transition"><ChevronRight size={20} /></button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 bg-secondary-50/50 border-b border-border">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="px-2 py-3 text-center text-xs font-bold text-text-muted uppercase tracking-wider">{day}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border">
          {/* Empty cells for days before the 1st */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="h-32 bg-secondary-50/30"></div>
          ))}

          {/* Actual Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayReservations = reservationsByDay[dayNum] || [];
            const isToday = dayNum === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

            return (
              <div key={dayNum} className={`h-32 p-2 flex flex-col gap-1 overflow-hidden ${isToday ? 'bg-primary-50/30' : 'bg-surface'}`}>
                <div className={`text-sm font-bold mb-1 ${isToday ? 'text-primary-600' : 'text-text'}`}>
                  {dayNum}
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {dayReservations.map((res, idx) => (
                    <Link 
                      to={`/reservations/${res.reservationId}`} 
                      key={idx} 
                      className={`block px-2 py-1 rounded text-[10px] font-semibold truncate hover:opacity-80 transition ${getStatusColor(res.status)}`}
                      title={`${res.guest?.fullName} - Room ${res.reservationRooms?.[0]?.room?.roomNumber}`}
                    >
                      {res.guest?.fullName}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}