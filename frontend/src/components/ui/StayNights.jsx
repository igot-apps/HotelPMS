// Shows "· 3 nights" beside a departure date so staff and guests see the stay length at a glance.
// Dates are YYYY-MM-DD strings from date inputs; nothing is shown until the range is valid.
export function countNights(checkIn, checkOut) {
  const toDay = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.UTC(...value.split('-').map((part, i) => Number(part) - (i === 1 ? 1 : 0))) : NaN);
  const nights = Math.round((toDay(checkOut) - toDay(checkIn)) / 86400000);
  return Number.isFinite(nights) && nights > 0 ? nights : 0;
}

export default function StayNights({ checkIn, checkOut, className = '' }) {
  const nights = countNights(checkIn, checkOut);
  if (!nights) return null;
  return (
    <span className={`ml-1 font-semibold normal-case text-primary-700 ${className}`} aria-live="polite">
      · {nights} night{nights === 1 ? '' : 's'}
    </span>
  );
}
