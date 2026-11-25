import { atProperty } from '../../shared/utils/property-access';
import { createHash } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import type { Actor } from './recovery.service';
import { simulationRecipient, momoPhone, simulateRefundInTransaction } from './refund-simulation.service';
import { hotelIsNonRefundable } from './refund-policy';
const cents = (value: any) => Math.round(Number(value || 0) * 100);
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const refundVersion = (res: any) => createHash('sha256').update(JSON.stringify([res.updatedAt, res.status, res.totalAmount, res.amountPaid, res.payments.map((p: any) => [p.paymentId, p.amount, p.status, p.updatedAt]).sort(), res.refunds.map((r: any) => r.refundId).sort()])).digest('hex');
// Refunds are paid back by the hotel (no provider refunds), so Paystack is not a refund method.
const methods = ['Cash', 'MobileMoney', 'BankTransfer'];
async function staff(tx: any, actor: Actor, manager = false) {
  const user = await tx.user.findFirst({ where: { userId: actor.userId, ...atProperty(actor.propertyId), isActive: true }, include: { role: true } });
  if (!user || !['Manager', 'Receptionist'].includes(user.role.roleName) || (manager && user.role.roleName !== 'Manager')) throw fail(manager ? 'Only an active hotel manager can approve or complete refunds.' : 'Active hotel staff required.', 403);
  return user;
}
async function atomic<T>(work: (tx: any) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 }); }
    catch (error: any) { if ((error.code !== 'P2034' && error.meta?.code !== '40001') || retry >= 2) throw error; }
  }
}
async function locked(tx: any, actor: Actor, id: string) {
  const rows = await tx.$queryRaw`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${id} AND "propertyId" = ${actor.propertyId} FOR UPDATE`;
  if (!rows.length) throw fail('Reservation not found for this hotel.', 404);
  return tx.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { payments: true, refunds: true } });
}
function balance(res: any) {
  const gross = res.payments.filter((payment: any) => payment.status === 'Completed').reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
  const returned = res.refunds.reduce((sum: number, refund: any) => sum + cents(refund.amount), 0);
  const net = gross - returned;
  if (net < 0 || Math.abs(net - cents(res.amountPaid)) > 1) throw fail('The payment history and booking balance differ. Reconcile them before refunding.');
  const released = ['Cancelled', 'Expired'].includes(res.status);
  if (!released && (res.totalAmount === null || !Number.isFinite(Number(res.totalAmount)))) throw fail('Reconcile the booking total before refunding.');
  return { net, eligible: released ? net : Math.max(0, net - cents(res.totalAmount)) };
}
// Money still refundable from payments taken at the hotel (online payments are never refunded).
function refundableAtHotel(res: any) {
  return res.payments.filter((p: any) => p.status === 'Completed' && !p.verifiedProvider)
    .reduce((sum: number, p: any) => sum + cents(p.amount) - res.refunds.filter((r: any) => r.paymentId === p.paymentId).reduce((s: number, r: any) => s + cents(r.amount), 0), 0);
}
export async function netPaid(tx: any, reservationId: string) {
  const paid = await tx.payment.aggregate({ where: { reservationId, status: 'Completed' }, _sum: { amount: true } });
  const returned = await tx.refund.aggregate({ where: { reservationId }, _sum: { amount: true } });
  return (cents(paid._sum.amount) - cents(returned._sum.amount)) / 100;
}
async function preview(tx: any, actor: Actor, id: string, input: any, excludeId?: number) {
  const res = await locked(tx, actor, id);
  const mode = input.mode || 'Manual';
  if (!['Manual', 'SimulatedMoMo'].includes(mode)) throw fail('Choose manual refund or simulated MoMo.');
  const recipientPhone = mode === 'SimulatedMoMo' ? await simulationRecipient(tx, actor, res) : null;
  if (excludeId && mode === 'SimulatedMoMo' && recipientPhone !== input.recipientPhone) throw fail('The recipient phone changed. Reject this request and submit a new one.');
  const totals = balance(res);
  const paymentId = Number(input.paymentId), amount = Number(input.amount);
  if (!Number.isSafeInteger(paymentId) || !Number.isFinite(amount) || amount <= 0 || amount > 99999999.99 || cents(amount) / 100 !== amount) throw fail('Choose an original payment and a positive refund amount with at most two decimal places.');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500) throw fail('Choose a refund reason between 5 and 500 characters.');
  const payment = res.payments.find((item: any) => item.paymentId === paymentId && item.status === 'Completed');
  if (!payment) throw fail('Choose a completed payment from this reservation.');
  // Online payments confirmed by the provider are strictly non-refundable.
  if (payment.verifiedProvider) throw fail('Online payments are non-refundable. Choose a payment taken at the hotel.');
  const reserved = await tx.correctionRequest.findMany({ where: { propertyId: actor.propertyId, reservationId: id, action: 'refund', status: { in: ['Pending', 'Approved'] }, ...(excludeId ? { requestId: { not: excludeId } } : {}) } });
  const held = reserved.reduce((sum: number, item: any) => sum + cents(item.input.amount), 0);
  const heldOnPayment = reserved.filter((item: any) => Number(item.input.paymentId) === paymentId).reduce((sum: number, item: any) => sum + cents(item.input.amount), 0);
  const alreadyReturned = res.refunds.filter((item: any) => item.paymentId === paymentId).reduce((sum: number, item: any) => sum + cents(item.amount), 0);
  const maximum = Math.min(totals.eligible - held, cents(payment.amount) - alreadyReturned - heldOnPayment);
  if (cents(amount) > maximum) throw fail(`Refund exceeds the available amount (GHS ${Math.max(0, maximum / 100).toFixed(2)}). Other pending or approved refunds also reserve this balance.`);
  const version = refundVersion(res);
  return { action: 'refund', version, reservationId: id, amount, paymentId, mode, recipientPhone, originalAmount: Number(payment.amount), reason: input.reason.trim(), message: mode === 'SimulatedMoMo' ? `Approve a TEST MoMo refund of GHS ${amount.toFixed(2)} to ${recipientPhone}. Approval marks this TEST refund as sent and updates the booking test balance. No real money is transferred.` : `Approve GHS ${amount.toFixed(2)} from payment #${paymentId}. Approval does not return money. Record completion only after the money has been returned.`, maximum: maximum / 100 };
}
export async function refundPreviewInTransaction(tx: any, actor: Actor, id: string, input: any, requestId?: number) {
  await staff(tx, actor);
  return preview(tx, actor, id, input, requestId);
}
export async function requestRefund(actor: Actor, id: string, input: any) {
  const details = input.preview !== true && input.recordDirectly === true && input.mode !== 'SimulatedMoMo' ? completionDetails(input) : null;
  // No payment chosen: one amount for the whole booking, split across its payments by the server.
  if (input.paymentId === undefined || input.paymentId === null || input.paymentId === '') return refundWholeBooking(actor, id, input, details);
  return atomic(async tx => {
    // Front desk staff (managers and receptionists) record refunds directly; the refund record,
    // payment balance and audit log are the accountability, not a prior approval.
    const user = await staff(tx, actor);
    const result = await preview(tx, actor, id, input);
    if (input.preview === true) {
      return { ...result, message: result.mode === 'SimulatedMoMo'
        ? `Record a TEST MoMo refund of GHS ${result.amount.toFixed(2)} to ${result.recipientPhone}. No real money is transferred.`
        : `Record GHS ${result.amount.toFixed(2)} returned from payment #${result.paymentId}. Only record this after the guest has received the money.` };
    }
    if (input.expectedVersion !== result.version) throw fail('The booking changed. Preview the refund again.');
    if (input.recordDirectly !== true) throw fail('Refresh the page and use Record refund.');
    if (result.mode === 'SimulatedMoMo') throw fail('Simulated MoMo refunds have been removed. Record the money returned to the guest instead.');
    // Non-refundable hotels keep the money; a refund is only recorded as a confirmed, audited exception.
    const policyException = await hotelIsNonRefundable(tx, actor.propertyId);
    if (policyException && input.policyException !== true) throw Object.assign(fail('This hotel is non-refundable. Confirm this refund is an exception to the policy.'), { code: 'NON_REFUNDABLE' });
    const refundInput = { paymentId: result.paymentId, amount: result.amount, reason: result.reason, mode: result.mode, recipientPhone: result.recipientPhone, ...(policyException ? { policyException: true } : {}) };
    let request = await tx.correctionRequest.create({ data: {
      propertyId: actor.propertyId, reservationId: id, requestedBy: actor.userId,
      action: 'refund', expectedVersion: result.version, input: refundInput,
      status: 'Approved', reviewedBy: actor.userId, reviewedAt: new Date(),
    } });
    if (result.mode === 'SimulatedMoMo') {
      const simulation = await simulateRefundInTransaction(tx, actor, request, result);
      request = await tx.correctionRequest.update({ where: { requestId: request.requestId }, data: { status: 'Simulated', input: { ...refundInput, simulation } } });
      await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Reservation', action: 'CorrectionRequestSimulated', newData: { reservationId: id, requestId: request.requestId, amount: result.amount, paymentId: result.paymentId, reason: result.reason } } });
      return request;
    }
    const res = await locked(tx, actor, id);
    await recordReturn(tx, actor, user, res, request, result, details!);
    return { ...request, status: 'Completed' };
  }).catch((error: any) => { if (error.code === 'P2002') throw fail('This refund or reference was already recorded. Refresh and check the return history.'); throw error; });
}
// Split a whole-booking refund across the payments taken at the hotel, newest payment first (online
// payments are never refunded). Uses the same limits as a single-payment refund: what each payment has
// left after earlier refunds and open requests, and the booking's refundable balance.
async function splitPlan(tx: any, actor: Actor, id: string, input: any) {
  const res = await locked(tx, actor, id);
  if ((input.mode || 'Manual') !== 'Manual') throw fail('Simulated MoMo refunds have been removed. Record the money returned to the guest instead.');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999.99 || cents(amount) / 100 !== amount) throw fail('Enter a positive refund amount with at most two decimal places.');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500) throw fail('Choose a refund reason between 5 and 500 characters.');
  const totals = balance(res);
  const open = await tx.correctionRequest.findMany({ where: { propertyId: actor.propertyId, reservationId: id, action: 'refund', status: { in: ['Pending', 'Approved'] } } });
  const held = open.reduce((sum: number, item: any) => sum + cents(item.input.amount), 0);
  const sources = res.payments.filter((pay: any) => pay.status === 'Completed' && !pay.verifiedProvider).sort((a: any, b: any) => b.paymentId - a.paymentId).map((pay: any) => ({ pay,
    available: cents(pay.amount) - res.refunds.filter((x: any) => x.paymentId === pay.paymentId).reduce((sum: number, x: any) => sum + cents(x.amount), 0)
      - open.filter((x: any) => Number(x.input.paymentId) === pay.paymentId).reduce((sum: number, x: any) => sum + cents(x.input.amount), 0) }));
  const maximum = Math.min(totals.eligible - held, sources.reduce((sum: number, source: any) => sum + Math.max(0, source.available), 0));
  if (cents(amount) > maximum) throw fail(`Refund exceeds the available amount (GHS ${Math.max(0, maximum / 100).toFixed(2)}). Other pending or approved refunds also reserve this balance.`);
  let left = cents(amount);
  const parts: { paymentId: number; method: string; amount: number }[] = [];
  for (const { pay, available } of sources) {
    const take = Math.min(left, Math.max(0, available));
    if (take > 0) { parts.push({ paymentId: pay.paymentId, method: pay.paymentMethod, amount: take / 100 }); left -= take; }
    if (!left) break;
  }
  return { version: refundVersion(res), amount, parts, reason: input.reason.trim(), maximum: maximum / 100 };
}
async function refundWholeBooking(actor: Actor, id: string, input: any, details: ReturnType<typeof completionDetails> | null) {
  return atomic(async tx => {
    const user = await staff(tx, actor);
    const plan = await splitPlan(tx, actor, id, input);
    const from = plan.parts.map(part => `payment #${part.paymentId} (${part.method}) GHS ${part.amount.toFixed(2)}`).join(' and ');
    if (input.preview === true) return { action: 'refund', version: plan.version, reservationId: id, amount: plan.amount, parts: plan.parts, mode: 'Manual', reason: plan.reason, maximum: plan.maximum,
      message: `Record GHS ${plan.amount.toFixed(2)} returned to the guest, taken from ${from}. Only record this after the guest has received the money.` };
    if (input.expectedVersion !== plan.version) throw fail('The booking changed. Preview the refund again.');
    if (input.recordDirectly !== true || !details) throw fail('Refresh the page and use Record refund.');
    const policyException = await hotelIsNonRefundable(tx, actor.propertyId);
    if (policyException && input.policyException !== true) throw Object.assign(fail('This hotel is non-refundable. Confirm this refund is an exception to the policy.'), { code: 'NON_REFUNDABLE' });
    // One refund record per payment, all in this transaction: either the whole amount is recorded or nothing is.
    const refunds = [];
    for (const [index, part] of plan.parts.entries()) {
      const result = await preview(tx, actor, id, { ...input, mode: 'Manual', paymentId: part.paymentId, amount: part.amount });
      const refundInput = { paymentId: result.paymentId, amount: result.amount, reason: result.reason, mode: 'Manual', recipientPhone: null, ...(plan.parts.length > 1 ? { splitOf: plan.amount } : {}), ...(policyException ? { policyException: true } : {}) };
      const request = await tx.correctionRequest.create({ data: {
        propertyId: actor.propertyId, reservationId: id, requestedBy: actor.userId,
        action: 'refund', expectedVersion: result.version, input: refundInput,
        status: 'Approved', reviewedBy: actor.userId, reviewedAt: new Date(),
      } });
      // A shared receipt reference is kept on every part (references are unique per method).
      const partDetails = plan.parts.length > 1 && details.reference ? { ...details, reference: `${details.reference} (part ${index + 1} of ${plan.parts.length})`.slice(0, 200) } : details;
      refunds.push(await recordReturn(tx, actor, user, await locked(tx, actor, id), request, result, partDetails));
    }
    return { status: 'Completed', reservationId: id, amount: plan.amount, parts: plan.parts, refunds };
  }).catch((error: any) => { if (error.code === 'P2002') throw fail('This refund or reference was already recorded. Refresh and check the return history.'); throw error; });
}
export async function refundOverview(actor: Actor, id: string) {
  await staff(prisma, actor);
  const res = await prisma.reservation.findFirst({ where: { reservationId: id, propertyId: actor.propertyId }, include: { propertyGuest: { select: { phone: true } }, platformGuest: { select: { phone: true } }, payments: { orderBy: { paymentId: 'asc' } }, refunds: { orderBy: { returnedAt: 'desc' } } } });
  if (!res) throw fail('Reservation not found for this hotel.', 404);
  const totals = balance(res);
  const requests = await prisma.correctionRequest.findMany({ where: { reservationId: id, propertyId: actor.propertyId, action: 'refund' }, include: { requester: { select: { fullName: true } }, reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } });
  const open = requests.filter(r => ['Pending', 'Approved'].includes(r.status));
  const held = open.reduce((sum, r) => sum + cents((r.input as any).amount), 0);
  return { nonRefundable: await hotelIsNonRefundable(prisma, actor.propertyId), simulatedReturnedTotal: res.refunds.filter(r => r.isSimulated).reduce((sum,r) => sum+cents(r.amount),0)/100, actualReturnedTotal: res.refunds.filter(r => !r.isSimulated).reduce((sum,r) => sum+cents(r.amount),0)/100, simulationRecipientPhone: momoPhone(res.guestPhoneSnapshot || res.propertyGuest?.phone || res.platformGuest?.phone), refundable: Math.min(Math.max(0, totals.eligible - held), refundableAtHotel(res)) / 100, totalRefundable: totals.eligible / 100, returnedTotal: res.refunds.reduce((sum, r) => sum + cents(r.amount), 0) / 100, requests, refunds: res.refunds, payments: res.payments.filter(p => p.status === 'Completed').map(p => ({ paymentId: p.paymentId, amount: Number(p.amount), method: p.paymentMethod, online: Boolean(p.verifiedProvider), available: p.verifiedProvider ? 0 : Math.max(0, Math.min(totals.eligible - held, cents(p.amount) - res.refunds.filter(r => r.paymentId === p.paymentId).reduce((sum, r) => sum + cents(r.amount), 0) - open.filter(r => Number((r.input as any).paymentId) === p.paymentId).reduce((sum, r) => sum + cents((r.input as any).amount), 0))) / 100 })) };
}
function completionDetails(input: any) {
  if (input.moneyReturned !== true || !methods.includes(input.method)) throw fail('Confirm that the money was returned, and enter a return method.');
  if (input.reference != null && typeof input.reference !== 'string') throw fail('Enter a valid refund reference or leave it blank.');
  const reference = typeof input.reference === 'string' ? input.reference.trim() || null : null;
  if (reference && reference.length > 200) throw fail('The refund reference must be at most 200 characters.');
  const returnedAt = input.returnedAt ? new Date(input.returnedAt) : new Date();
  if (!Number.isFinite(returnedAt.getTime()) || returnedAt.getTime() > Date.now() + 300000) throw fail('Choose a valid return date that is not in the future.');
  return { method: input.method as string, reference, returnedAt };
}
async function recordReturn(tx: any, actor: Actor, user: any, res: any, request: any, result: any, details: ReturnType<typeof completionDetails>) {
  const { method, reference, returnedAt } = details;
  if (reference && await tx.refund.findFirst({ where: { propertyId: actor.propertyId, method, reference } })) throw fail('That refund reference is already recorded. Check the existing return before continuing.');
  const payment = res.payments.find((p: any) => p.paymentId === result.paymentId);
  if (returnedAt < payment.paymentDate) throw fail('The return date cannot be before the original payment.');
  const totals = balance(res);
  const remaining = Math.max(0, totals.eligible - cents(result.amount));
  const refund = await tx.refund.create({ data: { requestId: request.requestId, propertyId: actor.propertyId, reservationId: request.reservationId, paymentId: result.paymentId, amount: result.amount, method, reference, returnedBy: actor.userId, returnedByName: user.fullName, returnedAt } });
  await tx.reservation.update({ where: { reservationId: request.reservationId }, data: { amountPaid: (totals.net - cents(result.amount)) / 100, refundDue: remaining / 100, refundStatus: remaining ? 'Pending' : 'Processed' } });
  await tx.correctionRequest.update({ where: { requestId: request.requestId }, data: { status: 'Completed' } });
  await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Reservation', action: 'RefundCompleted', newData: { reservationId: request.reservationId, requestId: request.requestId, refundId: refund.refundId, amount: result.amount, method: refund.method, reference: refund.reference, returnedAt: returnedAt.toISOString(), reason: result.reason, ...(request.input?.policyException ? { policyException: true } : {}) } } });
  return refund;
}
export async function completeRefund(actor: Actor, requestId: number, input: any) {
  const details = completionDetails(input);
  const { reference } = details;
  return atomic(async tx => {
    const user = await staff(tx, actor);
    const request = await tx.correctionRequest.findFirst({ where: { requestId, propertyId: actor.propertyId, action: 'refund' } });
    if (!request) throw fail('Refund request not found.', 404);
    if ((request.input as any).mode === 'SimulatedMoMo') throw fail('This is a simulation request. It cannot record real money returned.');
    const res = await locked(tx, actor, request.reservationId);
    const existing = await tx.refund.findUnique({ where: { requestId } });
    if (existing) {
      if (existing.method !== input.method || existing.reference !== reference) throw fail('This refund was already recorded with different details. Review its history.');
      return existing;
    }
    // Requests made before direct refunds (still Pending) are resolved here in one step; the amount is
    // re-checked against what is refundable now, and this request's own hold is not counted twice.
    if (!['Pending', 'Approved'].includes(request.status)) throw fail('This refund request is already closed. Refresh to see its history.');
    const result = await preview(tx, actor, request.reservationId, request.input, requestId);
    if (request.status === 'Pending') await tx.correctionRequest.update({ where: { requestId }, data: { status: 'Approved', reviewedBy: actor.userId, reviewedAt: new Date() } });
    return recordReturn(tx, actor, user, res, request, result, details);
  }).catch((error: any) => { if (error.code === 'P2002') throw fail('This refund or reference was already recorded. Refresh and check the return history.'); throw error; });
}
