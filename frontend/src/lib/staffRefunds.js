// Refunds each staff member recorded on the report's date, merged into the "money taken by each staff
// member" rows. Used for monitoring only; money totals elsewhere keep using the date the refund was returned.
export function refundsRecordedToday(daily) {
  const all = [...(daily?.refunds || []), ...(daily?.refundsRecordedLate || [])];
  return all.filter((r, i) => r.recordedOn === daily?.date && all.findIndex((x) => x.refundId === r.refundId) === i);
}

export function staffRowsWithRefunds(daily) {
  const rows = (daily?.byStaff || []).map((row) => ({ ...row, refunds: [] }));
  for (const refund of refundsRecordedToday(daily)) {
    const key = refund.returnedBy ? `staff:${refund.returnedBy}` : `name:${refund.returnedByName}`;
    let row = rows.find((r) => r.key === key);
    if (!row) { row = { key, name: refund.returnedByName, count: 0, total: 0, refunds: [] }; rows.push(row); }
    row.refunds.push({ ...refund, recordedLate: refund.returnedOn !== refund.recordedOn });
  }
  return rows;
}
