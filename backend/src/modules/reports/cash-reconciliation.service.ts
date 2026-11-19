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

// Read-only facts for the manager: cash payments that were corrected down, and money entries recorded
// after a person's latest count. These explain differences; they do not change any figure.
async function cashActivity(db: any, propertyId: number, date: string, timeZone: string) {
  const { gte, lt } = dayBounds(date, timeZone);
  const [voided, latePayments, refunds] = await Promise.all([
    db.payment.findMany({ where: { propertyId, status: 'Voided', paymentMethod: 'Cash', verifiedProvider: null, receivedBy: { not: null }, paymentDate: { gte, lt } },
      select: { paymentId: true, amount: true, receivedBy: true, reservationId: true, receiver: { select: { fullName: true } }, reservation: { select: { confirmationCode: true } } } }),
    db.payment.findMany({ where: { propertyId, status: 'Completed', paymentMethod: 'Cash', verifiedProvider: null, receivedBy: { not: null }, paymentDate: { gte, lt }, NOT: { notes: { startsWith: 'Correction of payment #' } } },
      select: { paymentId: true, amount: true, receivedBy: true, createdAt: true, reservation: { select: { reservationId: true, confirmationCode: true } } } }),
    db.refund.findMany({ where: { propertyId, isSimulated: false, method: 'Cash', returnedBy: { not: null }, returnedAt: { gte, lt } },
      select: { refundId: true, amount: true, returnedBy: true, returnedByName: true, createdAt: true, reservationId: true, reservation: { select: { confirmationCode: true } }, request: { select: { input: true } } } }),
  ]);
  const replacements = voided.length ? await db.payment.findMany({ where: { OR: voided.map((p: any) => ({ notes: { startsWith: `Correction of payment #${p.paymentId}:` } })) }, select: { paymentId: true, amount: true, notes: true, status: true } }) : [];
  const audits = voided.length ? await db.auditLog.findMany({ where: { entityType: 'Reservation', action: 'Correction:correct-payment', OR: [...new Set(voided.map((p: any) => p.reservationId))].map(id => ({ newData: { path: ['reservationId'], equals: id } })) },
    select: { newData: true, createdAt: true, user: { select: { fullName: true } } } }) : [];
  const corrections = voided.map((p: any) => {
    const replacement = replacements.find((r: any) => r.notes?.startsWith(`Correction of payment #${p.paymentId}:`) && r.status !== 'Voided');
    const audit = audits.find((a: any) => { const result = (a.newData as any)?.value?.result || {}; return result.paymentId === p.paymentId || (replacement && result.replacementPaymentId === replacement.paymentId); });
    const original = cents(p.amount), corrected = replacement ? cents(replacement.amount) : 0;
    return {
      paymentId: p.paymentId, reservationId: p.reservationId, confirmationCode: p.reservation.confirmationCode, staffUserId: p.receivedBy,
      original: fromCents(original), corrected: fromCents(corrected), difference: fromCents(corrected - original),
      reason: (audit?.newData as any)?.reason || replacement?.notes?.replace(/^Correction of payment #\d+:\s*/, '') || null,
      collectedBy: p.receiver?.fullName || 'Former staff', correctedBy: audit?.user?.fullName || null, correctedAt: audit?.createdAt || null,
    };
  }).filter((c: any) => c.difference < 0); // only corrections that lowered expected cash
  return { corrections, latePayments, refunds };
}

export async function cashReconciliation(actor: Actor, requestedDate?: unknown) {
  const user = await staffAccount(prisma, actor);
  const timeZone = user.property?.timezone || 'Africa/Accra';
  const date = pickDate(requestedDate, timeZone);
  const manager = user.role.roleName === 'Manager';
  const [figures, counts, activity] = await Promise.all([
    deskFigures(prisma, actor.propertyId, date, timeZone),
    prisma.cashCount.findMany({
      where: { propertyId: actor.propertyId, businessDate: new Date(`${date}T00:00:00Z`), ...(manager ? {} : { staffUserId: actor.userId }) },
      include: { staff: { select: { fullName: true } }, recorder: { select: { fullName: true } } },
      orderBy: { recordedAt: 'desc' },
    }),
    cashActivity(prisma, actor.propertyId, date, timeZone),
  ]);
  const history = counts.map(c => ({
    cashCountId: c.cashCountId, staffUserId: c.staffUserId, staffName: c.staff.fullName,
    expectedAmount: Number(c.expectedAmount), countedAmount: Number(c.countedAmount), difference: Number(c.difference),
    note: c.note, recordedBy: c.recorder.fullName, recordedAt: c.recordedAt,
  }));
  // Everyone who handled money that day, plus anyone with a saved count.
  for (const c of history) if (!figures.staff.has(c.staffUserId)) figures.staff.set(c.staffUserId, { userId: c.staffUserId, name: c.staffName, cashIn: 0, cashRefunds: 0, mobileMoney: 0, card: 0, other: 0, refundsOther: 0 });
  for (const c of activity.corrections) if (!figures.staff.has(c.staffUserId)) figures.staff.set(c.staffUserId, { userId: c.staffUserId, name: c.collectedBy, cashIn: 0, cashRefunds: 0, mobileMoney: 0, card: 0, other: 0, refundsOther: 0 });
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
        // Cash payments of this person corrected down (who collected it and who corrected it are both shown).
        cashCorrections: activity.corrections.filter((c: any) => c.staffUserId === r.userId),
        // Entries recorded or corrected after this person's latest count, with their effect on expected cash.
        changesAfterCount: latest ? [
          ...activity.latePayments.filter((p: any) => p.receivedBy === r.userId && p.createdAt > latest.recordedAt)
            .map((p: any) => ({ kind: 'payment', effect: fromCents(cents(p.amount)), at: p.createdAt, by: r.name, reservationId: p.reservation.reservationId, confirmationCode: p.reservation.confirmationCode, detail: 'Cash payment recorded after the count' })),
          ...activity.refunds.filter((x: any) => x.returnedBy === r.userId && x.createdAt > latest.recordedAt)
            .map((x: any) => ({ kind: 'refund', effect: -fromCents(cents(x.amount)), at: x.createdAt, by: x.returnedByName, reservationId: x.reservationId, confirmationCode: x.reservation.confirmationCode, detail: `Cash refund recorded after the count${(x.request?.input as any)?.policyException ? ' (policy exception)' : ''}${(x.request?.input as any)?.reason ? `: ${(x.request.input as any).reason}` : ''}` })),
          ...activity.corrections.filter((c: any) => c.staffUserId === r.userId && c.correctedAt && c.correctedAt > latest.recordedAt)
            .map((c: any) => ({ kind: 'correction', effect: c.difference, at: c.correctedAt, by: c.correctedBy, reservationId: c.reservationId, confirmationCode: c.confirmationCode, detail: `Cash payment corrected from GHS ${c.original.toFixed(2)} to GHS ${c.corrected.toFixed(2)} after the count` })),
        ].sort((a: any, b: any) => +new Date(a.at) - +new Date(b.at)) : [],
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
