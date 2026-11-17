import { Check } from 'lucide-react';

const STEPS = ['Choose room', 'Review & pay', 'Confirmed'];

// Visual progress for the guest booking journey. Purely presentational.
export default function BookingSteps({ current = 1, failed = false }) {
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold sm:text-sm" aria-label="Booking progress">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const tone = done ? 'bg-primary-600 text-white' : active ? (failed ? 'bg-warning-500 text-white' : 'bg-primary-100 text-primary-700 ring-2 ring-primary-600') : 'bg-secondary-100 text-text-muted';
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}>{done ? <Check size={15} /> : index + 1}</span>
            <span className={`truncate ${active ? 'text-text' : 'text-text-muted'}`}>{label}</span>
            {index < STEPS.length - 1 && <span className={`hidden h-0.5 flex-1 rounded sm:block ${done ? 'bg-primary-600' : 'bg-border'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
