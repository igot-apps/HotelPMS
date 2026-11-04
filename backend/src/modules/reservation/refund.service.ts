import { createHash } from 'node:crypto';
import { prisma } from '../../shared/utils/prisma';
import type { Actor } from './recovery.service';
import { simulationRecipient, momoPhone } from './refund-simulation.service';
const cents = (value: any) => Math.round(Number(value || 0) * 100);
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const refundVersion = (res: any) => createHash('sha256').update(JSON.stringify([res.updatedAt, res.status, res.totalAmount, res.amountPaid, res.payments.map((p: any) => [p.paymentId, p.amount, p.status, p.updatedAt]).sort(), res.refunds.map((r: any) => r.refundId).sort()])).digest('hex');
const methods = ['Cash', 'MobileMoney', 'BankTransfer', 'Paystack'];
async function staff(tx: any, actor: Actor, manager = false) {
  const user = await tx.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
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
  return atomic(async tx => {
    await staff(tx, actor);
    const result = await preview(tx, actor, id, input);
    if (input.preview === true) return result;
    if (input.expectedVersion !== result.version) throw fail('The booking changed. Preview the refund again.');
    const request = await tx.correctionRequest.create({ data: { propertyId: actor.propertyId, reservationId: id, requestedBy: actor.userId, action: 'refund', expectedVersion: result.version, input: { paymentId: result.paymentId, amount: result.amount, reason: result.reason, mode: result.mode, recipientPhone: result.recipientPhone } } });
    await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Reservation', action: 'RefundRequested', newData: { reservationId: id, requestId: request.requestId, amount: result.amount, paymentId: result.paymentId, reason: result.reason } } });
    return request;
  });
}
export async function refundOverview(actor: Actor, id: string) {
  await staff(prisma, actor);
  const res = await prisma.reservation.findFirst({ where: { reservationId: id, propertyId: actor.propertyId }, include: { propertyGuest: { select: { phone: true } }, platformGuest: { select: { phone: true } }, payments: { orderBy: { paymentId: 'asc' } }, refunds: { orderBy: { returnedAt: 'desc' } } } });
  if (!res) throw fail('Reservation not found for this hotel.', 404);
  const totals = balance(res);
  const requests = await prisma.correctionRequest.findMany({ where: { reservationId: id, propertyId: actor.propertyId, action: 'refund' }, include: { requester: { select: { fullName: true } }, reviewer: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } });
  const open = requests.filter(r => ['Pending', 'Approved'].includes(r.status));
  const held = open.reduce((sum, r) => sum + cents((r.input as any).amount), 0);
  return { simulatedReturnedTotal: res.refunds.filter(r => r.isSimulated).reduce((sum,r) => sum+cents(r.amount),0)/100, actualReturnedTotal: res.refunds.filter(r => !r.isSimulated).reduce((sum,r) => sum+cents(r.amount),0)/100, simulationRecipientPhone: momoPhone(res.guestPhoneSnapshot || res.propertyGuest?.phone || res.platformGuest?.phone), refundable: Math.max(0, totals.eligible - held) / 100, totalRefundable: totals.eligible / 100, returnedTotal: res.refunds.reduce((sum, r) => sum + cents(r.amount), 0) / 100, requests, refunds: res.refunds, payments: res.payments.filter(p => p.status === 'Completed').map(p => ({ paymentId: p.paymentId, amount: Number(p.amount), method: p.paymentMethod, available: Math.max(0, Math.min(totals.eligible - held, cents(p.amount) - res.refunds.filter(r => r.paymentId === p.paymentId).reduce((sum, r) => sum + cents(r.amount), 0) - open.filter(r => Number((r.input as any).paymentId) === p.paymentId).reduce((sum, r) => sum + cents((r.input as any).amount), 0))) / 100 })) };
}
export async function completeRefund(actor: Actor, requestId: number, input: any) {
  if (input.moneyReturned !== true || !methods.includes(input.method)) throw fail('Confirm that the money was returned, and enter a return method.');
  if (input.reference != null && typeof input.reference !== 'string') throw fail('Enter a valid refund reference or leave it blank.');
  const reference = typeof input.reference === 'string' ? input.reference.trim() || null : null;
  if (reference && reference.length > 200) throw fail('The refund reference must be at most 200 characters.');
  if (input.method === 'Paystack' && input.providerConfirmed !== true) throw fail('Confirm that Paystack reports the refund as successful before recording it.');
  const returnedAt = input.returnedAt ? new Date(input.returnedAt) : new Date();
  if (!Number.isFinite(returnedAt.getTime()) || returnedAt.getTime() > Date.now() + 300000) throw fail('Choose a valid return date that is not in the future.');
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
    if (request.status !== 'Approved') throw fail('A manager must approve this refund before completion.');
    if (reference && await tx.refund.findFirst({ where: { propertyId: actor.propertyId, method: input.method, reference } })) throw fail('That refund reference is already recorded. Check the existing return before continuing.');
    const result = await preview(tx, actor, request.reservationId, request.input, requestId);
    const payment = res.payments.find((p: any) => p.paymentId === result.paymentId);
    if (returnedAt < payment.paymentDate) throw fail('The return date cannot be before the original payment.');
    const totals = balance(res);
    const remaining = Math.max(0, totals.eligible - cents(result.amount));
    const refund = await tx.refund.create({ data: { requestId, propertyId: actor.propertyId, reservationId: request.reservationId, paymentId: result.paymentId, amount: result.amount, method: input.method, reference, returnedBy: actor.userId, returnedByName: user.fullName, returnedAt } });
    await tx.reservation.update({ where: { reservationId: request.reservationId }, data: { amountPaid: (totals.net - cents(result.amount)) / 100, refundDue: remaining / 100, refundStatus: remaining ? 'Pending' : 'Processed' } });
    await tx.correctionRequest.update({ where: { requestId }, data: { status: 'Completed' } });
    await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Reservation', action: 'RefundCompleted', newData: { reservationId: request.reservationId, requestId, refundId: refund.refundId, amount: result.amount, method: refund.method, reference: refund.reference, returnedAt: returnedAt.toISOString(), reason: (request.input as any).reason } } });
    return refund;
  }).catch((error: any) => { if (error.code === 'P2002') throw fail('This refund or reference was already recorded. Refresh and check the return history.'); throw error; });
}
