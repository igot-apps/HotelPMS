import { prisma } from '../../shared/utils/prisma';
import { Actor, correctBookingInTransaction } from './recovery.service';
import { CORRECTION_ACTIONS, canCorrect, validateCorrectionPermissions } from './correction-policy';
import { refundPreviewInTransaction } from './refund.service';
import { validateFinancialDelegation, delegationLimit } from './financial-delegation';
import { comparePassword } from '../../shared/utils/password';
import { simulateRefundInTransaction } from './refund-simulation.service';

const include = { requester: { select: { fullName: true } }, reviewer: { select: { fullName: true } }, reservation: { select: { confirmationCode: true, guestNameSnapshot: true } } };
async function staff(tx: any, actor: Actor, manager = false) {
  const user = await tx.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
  if (!user || !['Manager', 'Receptionist'].includes(user.role.roleName) || (manager && user.role.roleName !== 'Manager')) throw new Error(manager ? 'An active hotel manager must review this request.' : 'Active hotel staff access required.');
  return user;
}
async function atomic<T>(work: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 }); }
    catch (error: any) { if ((error.code !== 'P2034' && error.meta?.code !== '40001') || attempt >= 2) throw error; }
  }
}
async function record(tx: any, actor: Actor, reservationId: string, action: string, value: any) {
  await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Reservation', action, newData: { reservationId, ...value } } });
}
export async function correctionAccess(actor: Actor) {
  const user = await staff(prisma, actor);
  return CORRECTION_ACTIONS.map(item => ({ ...item, canApply: canCorrect(user, item.action), limit: delegationLimit(user, item.action) }));
}
export async function setCorrectionPermissions(actor: Actor, userId: number, input: unknown, financialInput?: unknown, password?: unknown, confirmed?: unknown) {
  const permissions = validateCorrectionPermissions(input);
  return atomic(async tx => {
    const manager = await staff(tx, actor, true);
    const target = await tx.user.findFirst({ where: { userId, propertyId: actor.propertyId }, include: { role: true } });
    if (!target || target.role.roleName !== 'Receptionist') throw new Error('Choose a receptionist from your hotel.');
    const financial = validateFinancialDelegation(financialInput === undefined ? target.financialDelegation || {} : financialInput);
    const increased = Object.entries(financial).some(([action, limit]) => limit > Number(target.financialDelegation?.[action] || 0));
    if (increased && (confirmed !== true || typeof password !== 'string' || !await comparePassword(password, manager.passwordHash))) throw new Error('Confirm the delegation warning and enter your manager password to enable or increase financial access.');
    await tx.user.update({ where: { userId }, data: { correctionPermissions: permissions, financialDelegation: financial } });
    await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'User', action: 'CorrectionPermissionsChanged', oldData: { userId, permissions: target.correctionPermissions, financialDelegation: target.financialDelegation || {} }, newData: { userId, propertyId: actor.propertyId, permissions, financialDelegation: financial } } });
    return { correctionPermissions: permissions, financialDelegation: financial };
  });
}
export async function listRequests(actor: Actor, reservationId?: string) {
  const user = await staff(prisma, actor);
  return prisma.correctionRequest.findMany({ where: { propertyId: actor.propertyId, ...(reservationId ? { reservationId } : { status: 'Pending' }), ...(user.role.roleName === 'Manager' ? {} : { requestedBy: actor.userId }) }, include, orderBy: { createdAt: 'desc' }, take: 100 });
}
export async function createRequest(actor: Actor, reservationId: string, body: any) {
  // Keep only known fields. Client-supplied status, reviewer and preview flags are ignored.
  const input = Object.fromEntries(['action', 'stayId', 'stayIds', 'targetRoomId', 'paymentId', 'newAmount', 'newCheckOutDate', 'reason'].filter(key => body[key] !== undefined).map(key => [key, body[key]]));
  return atomic(async tx => {
    const user = await staff(tx, actor);
    if (user.role.roleName !== 'Receptionist') throw new Error('Managers can apply corrections directly.');
    const preview = await correctBookingInTransaction(tx, reservationId, actor, { ...input, preview: true }, true);
    if (body.expectedVersion !== preview.version) throw new Error('The reservation changed. Preview the correction again before requesting approval.');
    const pending = await tx.correctionRequest.findFirst({ where: { reservationId, requestedBy: actor.userId, status: 'Pending' } });
    if (pending) throw new Error('You already have a pending request for this reservation. Withdraw it before submitting another.');
    const request = await tx.correctionRequest.create({ data: { propertyId: actor.propertyId, reservationId, requestedBy: actor.userId, action: input.action, input: { ...input, roomLabel: preview.roomLabel || null, targetRoomLabel: preview.targetRoomLabel || null }, expectedVersion: preview.version }, include });
    await record(tx, actor, reservationId, 'CorrectionRequested', { requestId: request.requestId, reason: input.reason, action: input.action });
    return request;
  });
}
export async function previewRequest(actor: Actor, requestId: number) {
  return atomic(async tx => {
    await staff(tx, actor, true);
    const request = await tx.correctionRequest.findFirst({ where: { requestId, propertyId: actor.propertyId, status: 'Pending' } });
    if (!request) throw new Error('Pending request not found.');
    const preview = request.action === 'refund' ? await refundPreviewInTransaction(tx, actor, request.reservationId, request.input, request.requestId) : await correctBookingInTransaction(tx, request.reservationId, actor, { ...(request.input as any), preview: true });
    if (request.expectedVersion !== preview.version) throw new Error('This reservation changed since the request. Reject this request and ask the receptionist to submit an updated one.');
    return preview;
  });
}
export async function reviewRequest(actor: Actor, requestId: number, body: any) {
  if (!['approve', 'reject', 'withdraw'].includes(body.decision)) throw new Error('Choose approve, reject or withdraw.');
  const reviewReason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (body.decision === 'reject' && (reviewReason.length < 5 || reviewReason.length > 500)) throw new Error('Choose a rejection reason between 5 and 500 characters.');
  return atomic(async tx => {
    await staff(tx, actor, body.decision !== 'withdraw');
    // Always lock the booking before the request, matching create/correction lock order.
    const initial = await tx.correctionRequest.findFirst({ where: { requestId, propertyId: actor.propertyId } });
    if (!initial) throw new Error('Request not found for this hotel.');
    await tx.$queryRaw`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${initial.reservationId} AND "propertyId" = ${actor.propertyId} FOR UPDATE`;
    const request = await tx.correctionRequest.findFirst({ where: { requestId, propertyId: actor.propertyId } });
    if (!request || (request.status !== 'Pending' && !(request.action === 'refund' && request.status === 'Approved' && body.decision === 'reject'))) throw new Error('This request has already been handled.');
    if (body.decision === 'withdraw' && request.requestedBy !== actor.userId) throw new Error('You can only withdraw your own request.');
    let simulation: any = null;
    if (body.decision === 'approve') {
      if (body.expectedVersion !== request.expectedVersion) throw new Error('Review the request preview before approving.');
      if (request.action === 'refund') {
        const preview = await refundPreviewInTransaction(tx, actor, request.reservationId, request.input, requestId);
        if (preview.version !== request.expectedVersion) throw new Error('The booking or payment changed. Reject this request and ask for an updated refund request.');
        if ((request.input as any).mode === 'SimulatedMoMo') simulation = await simulateRefundInTransaction(tx, actor, request, preview);
      } else await correctBookingInTransaction(tx, request.reservationId, actor, { ...(request.input as any), preview: false, expectedVersion: request.expectedVersion });
    }
    const status = body.decision === 'approve' ? simulation ? 'Simulated' : 'Approved' : body.decision === 'reject' ? 'Rejected' : 'Withdrawn';
    const updated = await tx.correctionRequest.update({ where: { requestId }, data: { status, reviewedBy: actor.userId, reviewedAt: new Date(), reviewReason: body.decision === 'reject' ? reviewReason : null, ...(simulation ? { input: { ...(request.input as any), simulation } } : {}) }, include });
    await record(tx, actor, request.reservationId, `CorrectionRequest${status}`, { requestId, requestedBy: request.requestedBy, action: request.action, reason: body.decision === 'reject' ? reviewReason : (request.input as any).reason });
    return updated;
  });
}
