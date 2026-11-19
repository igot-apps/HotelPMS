import { prisma } from '../../shared/utils/prisma';
import { dayBounds, hotelDate } from './daily-overview.service';

type Actor = { userId: number; propertyId: number };
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
const fromCents = (value: number) => value / 100;
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

async function staffAccount(db: any, actor: Actor) {
  const user = await db.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true, property: { select: { timezone: true } } } });
  if (!user || !['Manager', 'Receptionist'].includes(user.role.roleName)) throw fail('Front desk staff required.', 403);
  return user;
}

function pickDate(requested: unknown, timeZone: string) {
  const today = hotelDate(new Date(), timeZone);
  if (requested === undefined || requested === null || requested === '') return today;
  if (typeof requested !== 'string') throw fail('Choose a valid date.');
  dayBounds(requested, timeZone); // validates the format
  if (requested > today) throw fail('You cannot reconcile a future date.');
  return requested;
}

// Money handled at the desk on one hotel date, per staff member. Uses the live records:
// voided payments are excluded, correction replacements count once (they replace the voided entry
// on the original day and person), simulated refunds are ignored. Online payments confirmed by the
// provider never count as anyone's cash.
async function deskFigures(db: any, propertyId: number, date: string, timeZone: string) {
  const { gte, lt } = dayBounds(date, timeZone);
  const [payments, refunds] = await Promise.all([
    db.payment.findMany({ where: { propertyId, status: 'Completed', paymentDate: { gte, lt } }, select: { amount: true, paymentMethod: true, receivedBy: true, verifiedProvider: true, receiver: { select: { fullName: true } } } }),
    db.refund.findMany({ where: { propertyId, isSimulated: false, returnedAt: { gte, lt } }, select: { amount: true, method: true, returnedBy: true, returnedByName: true } }),
  ]);
  const staff = new Map<number, any>();
  const row = (userId: number, name: string) => {
    if (!staff.has(userId)) staff.set(userId, { userId, name, cashIn: 0, cashRefunds: 0, mobileMoney: 0, card: 0, other: 0, refundsOther: 0 });
    return staff.get(userId);
  };
  let onlineCents = 0;
  const onlineByMethod: Record<string, number> = {};
  for (const p of payments) {
    const amount = cents(p.amount);
    if (p.verifiedProvider) { onlineCents += amount; onlineByMethod[p.paymentMethod] = (onlineByMethod[p.paymentMethod] || 0) + amount; continue; }
    if (p.receivedBy === null) continue; // legacy entries with no receiver and no provider confirmation
    const r = row(p.receivedBy, p.receiver?.fullName || 'Former staff');
    if (p.paymentMethod === 'Cash') r.cashIn += amount;
    else if (p.paymentMethod === 'MobileMoney') r.mobileMoney += amount;
    else if (p.paymentMethod === 'Card') r.card += amount;
    else r.other += amount;
  }
  let refundsCents = 0;
  for (const refund of refunds) {
    const amount = cents(refund.amount);
    refundsCents += amount;
    if (refund.returnedBy === null) continue;
    const r = row(refund.returnedBy, refund.returnedByName);
    if (refund.method === 'Cash') r.cashRefunds += amount; else r.refundsOther += amount;
  }
  return { staff, onlineCents, onlineByMethod, refundsCents };
}

export async function cashReconciliation(actor: Actor, requestedDate?: unknown) {
  const user = await staffAccount(prisma, actor);
  const timeZone = user.property?.timezone || 'Africa/Accra';
  const date = pickDate(requestedDate, timeZone);
  const manager = user.role.roleName === 'Manager';
  const [figures, counts] = await Promise.all([
    deskFigures(prisma, actor.propertyId, date, timeZone),
    prisma.cashCount.findMany({
      where: { propertyId: actor.propertyId, businessDate: new Date(`${date}T00:00:00Z`), ...(manager ? {} : { staffUserId: actor.userId }) },
      include: { staff: { select: { fullName: true } }, recorder: { select: { fullName: true } } },
      orderBy: { recordedAt: 'desc' },
    }),
  ]);
  const history = counts.map(c => ({
    cashCountId: c.cashCountId, staffUserId: c.staffUserId, staffName: c.staff.fullName,
    expectedAmount: Number(c.expectedAmount), countedAmount: Number(c.countedAmount), difference: Number(c.difference),
    note: c.note, recordedBy: c.recorder.fullName, recordedAt: c.recordedAt,
  }));
  // Everyone who handled money that day, plus anyone with a saved count.
  for (const c of history) if (!figures.staff.has(c.staffUserId)) figures.staff.set(c.staffUserId, { userId: c.staffUserId, name: c.staffName, cashIn: 0, cashRefunds: 0, mobileMoney: 0, card: 0, other: 0, refundsOther: 0 });
  if (!manager && !figures.staff.has(actor.userId)) figures.staff.set(actor.userId, { userId: actor.userId, name: user.fullName, cashIn: 0, cashRefunds: 0, mobileMoney: 0, card: 0, other: 0, refundsOther: 0 });

  const rows = [...figures.staff.values()]
    .filter(r => manager || r.userId === actor.userId)
    .map(r => {
      const expectedCash = r.cashIn - r.cashRefunds;
      const latest = history.find(c => c.staffUserId === r.userId) || null; // newest first
      return {
        userId: r.userId, name: r.name,
        cashTaken: fromCents(r.cashIn), cashRefunded: fromCents(r.cashRefunds), expectedCash: fromCents(expectedCash),
        mobileMoney: fromCents(r.mobileMoney), card: fromCents(r.card), other: fromCents(r.other), refundsOther: fromCents(r.refundsOther),
        latestCount: latest,
        // Live difference uses today's records; the saved count keeps the figures as they were when counted.
        differenceNow: latest ? fromCents(cents(latest.countedAmount) - expectedCash) : null,
        changedSinceCount: latest ? Math.abs(cents(latest.expectedAmount) - expectedCash) >= 1 : false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!manager) return { date, timeZone, role: 'Receptionist', staff: rows, history };

  const counted = rows.filter(r => r.latestCount);
  const outstanding = await prisma.reservation.findMany({ where: { propertyId: actor.propertyId, status: { in: ['Confirmed', 'InHouse', 'Completed'] } }, select: { totalAmount: true, amountPaid: true } });
  return {
    date, timeZone, role: 'Manager', staff: rows, history,
    totals: {
      expectedCash: fromCents(rows.reduce((s, r) => s + cents(r.expectedCash), 0)),
      // Hotel total = the sum of each person's latest count (no separate drawer count, so nothing is counted twice).
      countedCash: counted.length ? fromCents(counted.reduce((s, r) => s + cents(r.latestCount!.countedAmount), 0)) : null,
      expectedForCounted: fromCents(counted.reduce((s, r) => s + cents(r.expectedCash), 0)),
      difference: counted.length ? fromCents(counted.reduce((s, r) => s + cents(r.differenceNow), 0)) : null,
      notCounted: rows.filter(r => !r.latestCount && cents(r.expectedCash) !== 0).map(r => r.name),
      deskMobileMoney: fromCents(rows.reduce((s, r) => s + cents(r.mobileMoney), 0)),
      deskCard: fromCents(rows.reduce((s, r) => s + cents(r.card), 0)),
      verifiedOnline: fromCents(figures.onlineCents),
      verifiedOnlineByMethod: Object.fromEntries(Object.entries(figures.onlineByMethod).map(([k, v]) => [k, fromCents(v)])),
      refundsReturned: fromCents(figures.refundsCents),
      // Shown separately: money guests still owe is not missing cash.
      outstandingBalances: fromCents(outstanding.reduce((s, r) => s + Math.max(0, cents(r.totalAmount) - cents(r.amountPaid)), 0)),
    },
  };
}

// Save a cash count. Append-only: a recount adds a new entry; earlier counts are never changed.
export async function recordCashCount(actor: Actor, input: any) {
  const counted = Number(input?.countedAmount);
  if (input?.countedAmount === '' || !Number.isFinite(counted) || counted < 0 || counted > 99999999.99 || Math.round(counted * 100) / 100 !== counted) throw fail('Enter the cash counted (0 or more, up to 2 decimal places).');
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 300) : '';
  return prisma.$transaction(async tx => {
    const user = await staffAccount(tx, actor);
    const timeZone = user.property?.timezone || 'Africa/Accra';
    const date = pickDate(input?.date, timeZone);
    const staffUserId = input?.staffUserId === undefined || input?.staffUserId === null || input?.staffUserId === '' ? actor.userId : Number(input.staffUserId);
    if (!Number.isSafeInteger(staffUserId)) throw fail('Choose a staff member.');
    if (user.role.roleName !== 'Manager' && staffUserId !== actor.userId) throw fail('You can only record a count for your own cash.', 403);
    const staff = await tx.user.findFirst({ where: { userId: staffUserId, propertyId: actor.propertyId }, select: { userId: true, fullName: true } });
    if (!staff) throw fail('Staff member not found for this hotel.', 404);
    const figures = await deskFigures(tx, actor.propertyId, date, timeZone);
    const r = figures.staff.get(staffUserId);
    const expected = r ? r.cashIn - r.cashRefunds : 0;
    const countedCents = cents(counted);
    const saved = await tx.cashCount.create({ data: {
      propertyId: actor.propertyId, businessDate: new Date(`${date}T00:00:00Z`), staffUserId,
      expectedAmount: fromCents(expected), countedAmount: fromCents(countedCents), difference: fromCents(countedCents - expected),
      note: note || null, recordedBy: actor.userId,
    } });
    await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'CashCount', entityId: saved.cashCountId, action: 'CashCountRecorded',
      newData: { propertyId: actor.propertyId, date, staffUserId, staffName: staff.fullName, expected: fromCents(expected), counted: fromCents(countedCents), difference: fromCents(countedCents - expected), note: note || null } } });
    return { cashCountId: saved.cashCountId, date, staffUserId, expectedAmount: fromCents(expected), countedAmount: fromCents(countedCents), difference: fromCents(countedCents - expected) };
  });
}
