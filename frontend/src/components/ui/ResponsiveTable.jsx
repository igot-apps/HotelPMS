import { useLayoutEffect, useRef } from 'react';

// Keep native table semantics and desktop layout; label each mobile card field.
export default function ResponsiveTable({ children, className = '', ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const table = ref.current;
    const headings = [...(table?.tHead?.rows[0]?.cells || [])].map(cell => cell.textContent.trim());
    for (const body of table?.tBodies || []) {
      body.setAttribute('role', 'rowgroup');
      for (const row of body.rows) {
        row.setAttribute('role', 'row');
        [...row.cells].forEach((cell, index) => {
          cell.setAttribute('role', 'cell');
          if (cell.colSpan > 1) cell.dataset.fullWidth = 'true';
          else cell.dataset.label = headings[index] || '';
        });
      }
    }
  });
  return <table role="table" {...props} ref={ref} className={`responsive-table ${className}`}>{children}</table>;
}
