import { prisma } from '../../shared/utils/prisma';
import type { Actor } from './recovery.service';
const fail = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
export function momoPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/[\s()+-]/g, '');
  const match = /^(?:0|233)([25]\d{8})$/.exec(digits);
  return match ? `+233${match[1]}` : null;
}
async function staff(tx: any, actor: Actor, manager = false) {
  const user = await tx.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
  if (!user || !['Manager','Receptionist'].includes(user.role.roleName) || (manager && user.role.roleName !== 'Manager')) throw Object.assign(new Error(manager ? 'Only an active hotel manager can change simulation settings or approve a simulation.' : 'Active hotel staff access required.'), { statusCode: 403 });
}
export async function refundSimulationSettings(actor: Actor) {
  await staff(prisma, actor);
  const hotel = await prisma.property.findUniqueOrThrow({ where: { propertyId: actor.propertyId }, select: { refundSimulationEnabled: true } });
  return { enabled: hotel.refundSimulationEnabled, simulationOnly: true };
}
export async function setRefundSimulationSettings(actor: Actor, enabled: unknown) {
  if (typeof enabled !== 'boolean') throw fail('Choose whether to enable refund simulation.');
  return prisma.$transaction(async tx => {
    await staff(tx, actor, true);
    const old = await tx.property.findUniqueOrThrow({ where: { propertyId: actor.propertyId }, select: { refundSimulationEnabled: true } });
    await tx.property.update({ where: { propertyId: actor.propertyId }, data: { refundSimulationEnabled: enabled } });
    await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Property', action: 'RefundSimulationSettingChanged', oldData: { propertyId: actor.propertyId, enabled: old.refundSimulationEnabled }, newData: { propertyId: actor.propertyId, enabled, simulationOnly: true } } });
    return { enabled, simulationOnly: true };
  }, { isolationLevel: 'Serializable' });
}
export async function simulationRecipient(tx: any, actor: Actor, booking: any) {
  const hotel = await tx.property.findUnique({ where: { propertyId: actor.propertyId }, select: { refundSimulationEnabled: true, currency: true } });
  if (!hotel?.refundSimulationEnabled) throw fail('Simulated MoMo refunds are switched off. Ask the manager to enable simulation or request a manual refund.');
  if (hotel.currency !== 'GHS') throw fail('MoMo refund simulation currently supports GHS only.');
  const contact = await tx.reservation.findUniqueOrThrow({ where: { reservationId: booking.reservationId }, select: { guestPhoneSnapshot: true, propertyGuest: { select: { phone: true } }, platformGuest: { select: { phone: true } } } });
  const phone = momoPhone(contact.guestPhoneSnapshot || contact.propertyGuest?.phone || contact.platformGuest?.phone);
  if (!phone) throw fail('A valid Ghana mobile number is required on the booking contact before requesting a simulated MoMo refund.');
  return phone;
}
export async function simulateRefundInTransaction(tx: any, actor: Actor, request: any, preview: any) {
  await staff(tx, actor, true);
  const recipientPhone = await simulationRecipient(tx, actor, { reservationId: request.reservationId });
  if (recipientPhone !== request.input.recipientPhone || recipientPhone !== preview.recipientPhone) throw fail('The recipient phone changed. Reject this request and submit a new one.');
  const simulation = { reference: `SIM-MOMO-${request.requestId}`, recipientPhone, amount: Number(request.input.amount), currency: 'GHS', method: 'MobileMoney', simulatedAt: new Date().toISOString(), moneySent: false, status: 'Sent', balancesApplied: true };
  await applySimulatedReturnInTransaction(tx, actor, request, simulation);
  await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Reservation', action: 'RefundSimulated', newData: { reservationId: request.reservationId, requestId: request.requestId, ...simulation, reason: request.input.reason } } });
  return simulation;
}

// Uses the same booking lock and transaction as approval. No provider is contacted.
export async function applySimulatedReturnInTransaction(tx: any, actor: Actor, request: any, simulation: any) {
  const existing = await tx.refund.findUnique({ where: { requestId: request.requestId } });
  if (existing) {
    if (!existing.isSimulated) throw fail('This request already has an actual refund record.');
    return existing;
  }
  const booking = await tx.reservation.findFirst({ where: { reservationId: request.reservationId, propertyId: actor.propertyId }, include: { payments: true, refunds: true } });
  if (!booking || request.action !== 'refund' || request.input.mode !== 'SimulatedMoMo' || simulation.moneySent !== false) throw fail('Invalid simulated refund.');
  const cents = (value: any) => Math.round(Number(value || 0) * 100);
  const payment = booking.payments.find((p: any) => p.paymentId === Number(request.input.paymentId) && p.status === 'Completed');
  const amount = cents(request.input.amount);
  const net = booking.payments.filter((p: any) => p.status === 'Completed').reduce((sum: number,p: any) => sum+cents(p.amount),0) - booking.refunds.reduce((sum: number,r: any) => sum+cents(r.amount),0);
  if (!payment || !Number.isFinite(amount) || amount <= 0 || Math.abs(net-cents(booking.amountPaid)) > 1) throw fail('Reconcile the payment history before settling this simulation.');
  if (!['Cancelled','Expired'].includes(booking.status) && (booking.totalAmount === null || !Number.isFinite(Number(booking.totalAmount)))) throw fail('Reconcile the booking total before settling this simulation.');
  const eligible = ['Cancelled','Expired'].includes(booking.status) ? net : Math.max(0,net-cents(booking.totalAmount));
  const open = await tx.correctionRequest.findMany({ where: { reservationId: booking.reservationId, action: 'refund', status: { in: ['Pending','Approved'] }, requestId: { not: request.requestId } } });
  const held = open.reduce((sum: number,r: any)=>sum+cents(r.input.amount),0);
  const heldOnPayment = open.filter((r: any)=>Number(r.input.paymentId)===payment.paymentId).reduce((sum: number,r: any)=>sum+cents(r.input.amount),0);
  const paymentRemaining = cents(payment.amount)-booking.refunds.filter((r: any)=>r.paymentId===payment.paymentId).reduce((sum: number,r: any)=>sum+cents(r.amount),0);
  if (amount > eligible-held || amount > paymentRemaining-heldOnPayment) throw fail('This simulation exceeds the remaining refund balance.');
  const user = await tx.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId } });
  if (!user) throw fail('Simulation approver not found for this hotel.');
  const returnedAt = new Date(simulation.simulatedAt);
  if (!Number.isFinite(returnedAt.getTime()) || returnedAt < payment.paymentDate) throw fail('Invalid simulation date.');
  const refund = await tx.refund.create({ data: { isSimulated: true, requestId: request.requestId, propertyId: actor.propertyId, reservationId: request.reservationId, paymentId: payment.paymentId, amount: amount/100, method: 'MobileMoney', reference: simulation.reference, returnedBy: actor.userId, returnedByName: user.fullName, returnedAt } });
  const remaining = Math.max(0,eligible-amount);
  await tx.reservation.update({ where: { reservationId: booking.reservationId }, data: { amountPaid: (net-amount)/100, refundDue: remaining/100, refundStatus: remaining ? 'Pending' : 'Processed' } });
  return refund;
}
