import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

// Quick "find a booking" from the dashboard. Results open on the Reservations page (the one place
// where bookings are handled), using its existing search by code, guest name, phone or room.
export default function BookingSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    navigate(`/reservations?search=${encodeURIComponent(text)}&back=dashboard`);
  };
  return (
    <form role="search" onSubmit={submit} className="flex w-full gap-2">
      <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 shadow-sm focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20">
        <Search size={18} className="shrink-0 text-text-muted" />
        <span className="sr-only">Find a booking</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80}
          placeholder="Find a booking: code (e.g. RES-4501), guest name, phone or room"
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-text outline-none placeholder:text-text-muted" />
      </label>
      <button type="submit" disabled={!query.trim()} className="min-h-12 shrink-0 rounded-xl bg-primary-600 px-5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">Search</button>
    </form>
  );
}
