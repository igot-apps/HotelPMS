// Staff accountability for a period, built from the Daily overview (one day or a range).
// - Refunds RETURNED in the period count in money and refund totals (by the date the money went back).
// - Refunds RECORDED in the period for an earlier return date are listed separately for accountability;
//   they are not added to the period's totals (they belong to their return date). Each refund appears once.
export function staffRowsForPeriod(daily) {
  const rows = (daily?.byStaff || [])
    .filter((row) => row.key.startsWith('staff:'))
    .map((row) => ({ ...row, returned: [], recordedLate: [] }));
  const rowFor = (refund) => {
    const key = refund.returnedBy ? `staff:${refund.returnedBy}` : `name:${refund.returnedByName}`;
    let row = rows.find((r) => r.key === key);
    if (!row) { row = { key, name: refund.returnedByName, count: 0, total: 0, returned: [], recordedLate: [] }; rows.push(row); }
    return row;
  };
  for (const refund of daily?.refunds || []) rowFor(refund).returned.push({ ...refund, recordedLate: refund.returnedOn !== refund.recordedOn });
  for (const refund of daily?.refundsRecordedLate || []) rowFor(refund).recordedLate.push({ ...refund, recordedLate: true });
  return rows.map((row) => ({
    ...row,
    userId: row.key.startsWith('staff:') ? Number(row.key.slice(6)) : null,
    refundCount: row.returned.length,
    refundTotal: row.returned.reduce((sum, r) => sum + Number(r.amount), 0),
    exceptions: [...row.returned, ...row.recordedLate].filter((r) => r.policyException).length,
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// Money collected online (provider-verified), shown apart from staff collections.
export const onlineCollected = (daily) => (daily?.byStaff || []).find((row) => row.key === 'online')?.total || 0;
