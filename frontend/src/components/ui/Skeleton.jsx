// Shared loading placeholders shaped like the content they stand in for (shimmer comes from the
// `.skeleton` class in index.css). Use for first loads of lists, tables, cards and pages; keep
// spinners on buttons and for background refreshes.

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

// Announces loading to screen readers once; the placeholders themselves are hidden from them.
function Status({ label, className = '', children }) {
  return <div role="status" aria-live="polite" className={className}><span className="sr-only">{label}</span>{children}</div>;
}

const WIDTHS = ['w-2/5', 'w-1/4', 'w-1/5', 'w-1/6'];

// Rows of a list or table: a wider first column, then shorter ones.
export function SkeletonRows({ rows = 6, cols = 4, label = 'Loading…' }) {
  return (
    <Status label={label} className="w-full divide-y divide-border">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          {Array.from({ length: cols }, (_, col) => <Skeleton key={col} className={`h-4 ${col === 0 ? 'flex-1' : WIDTHS[col % WIDTHS.length]}`} />)}
        </div>
      ))}
    </Status>
  );
}

// The same rows inside a <tbody>, spanning every column.
export function SkeletonTableRows({ colSpan, ...props }) {
  return <tr><td colSpan={colSpan} data-full-width className="p-0"><SkeletonRows {...props} /></td></tr>;
}

// A grid of card-shaped blocks (room cards, booking cards, stat tiles).
export function SkeletonCards({ count = 6, className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3', cardClassName = 'h-40', label = 'Loading…' }) {
  return (
    <Status label={label} className={className}>
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={`rounded-xl ${cardClassName}`} />)}
    </Status>
  );
}

// A few text lines, for small cards and panels.
export function SkeletonLines({ lines = 3, label = 'Loading…', className = 'space-y-2' }) {
  return (
    <Status label={label} className={className}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-3/5' : 'w-full'}`} />)}
    </Status>
  );
}
