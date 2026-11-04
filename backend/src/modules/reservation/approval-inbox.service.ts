import { prisma } from '../../shared/utils/prisma';
import { Actor, correctionVersion } from './recovery.service';
import { CORRECTION_ACTIONS } from './correction-policy';
import { refundVersion } from './refund.service';

async function manager(actor: Actor) {
  const account = await prisma.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
  if (account?.role.roleName !== 'Manager') throw Object.assign(new Error('Hotel manager access required.'), { statusCode: 403 });
}
const include = {
  requester: { select: { fullName: true } }, reviewer: { select: { fullName: true } },
  refund: true,
  reservation: { select: { confirmationCode: true, guestNameSnapshot: true, updatedAt: true, status: true, totalAmount: true, amountPaid: true, payments: { select: { paymentId: true, amount: true, status: true, updatedAt: true } }, refunds: { select: { refundId: true } }, propertyGuest: { select: { fullName: true } }, platformGuest: { select: { fullName: true } }, reservationRooms: { select: { reservationRoomId: true, updatedAt: true, roomNumberSnapshot: true } } } },
};
function decorate(item: any) {
  return { ...item, guestName: item.reservation.guestNameSnapshot || item.reservation.propertyGuest?.fullName || item.reservation.platformGuest?.fullName || 'Guest not recorded', needsReview: item.status === 'Pending' && item.expectedVersion !== (item.action === 'refund' ? refundVersion(item.reservation) : correctionVersion(item.reservation)), roomLabel: item.input.roomLabel || item.reservation.reservationRooms.map((room: any) => room.roomNumberSnapshot ? `Room ${room.roomNumberSnapshot}` : 'Removed room').join(', ') };
}
export async function approvalCount(actor: Actor) {
  await manager(actor);
  const [pending, toReturn] = await prisma.$transaction([prisma.correctionRequest.count({ where: { propertyId: actor.propertyId, status: 'Pending' } }), prisma.correctionRequest.count({ where: { propertyId: actor.propertyId, status: 'Approved', action: 'refund' } })]);
  return { pending, toReturn, actionRequired: pending + toReturn };
}
export async function approvalInbox(actor: Actor, query: any) {
  await manager(actor);
  const status = query.status || 'Pending';
  if (!['Pending', 'ToReturn', 'History', 'Approved', 'Rejected', 'Withdrawn', 'Completed', 'Simulated'].includes(status)) throw new Error('Choose pending or a valid review status.');
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid pagination.');
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  const action = typeof query.action === 'string' ? query.action : '';
  if (action && !CORRECTION_ACTIONS.some(item => item.action === action)) throw new Error('Unknown correction action.');
  const scope = { propertyId: actor.propertyId };
  const reviewed = { NOT: { OR: [{ status: 'Pending' }, { status: 'Approved', action: 'refund' }] } };
  const where: any = { ...scope, ...(status === 'History' ? reviewed : status === 'ToReturn' ? { status: 'Approved', action: 'refund' } : { status, ...(status !== 'Pending' ? reviewed : {}) }), ...(action ? { action } : {}) };
  if (search) where.OR = [
    { reservation: { confirmationCode: { contains: search, mode: 'insensitive' } } },
    { reservation: { guestNameSnapshot: { contains: search, mode: 'insensitive' } } },
    { reservation: { propertyGuest: { fullName: { contains: search, mode: 'insensitive' } } } },
    { reservation: { platformGuest: { fullName: { contains: search, mode: 'insensitive' } } } },
    { requester: { fullName: { contains: search, mode: 'insensitive' } } },
    { input: { path: ['roomLabel'], string_contains: search } },
    { input: { path: ['targetRoomLabel'], string_contains: search } },
    { reservation: { reservationRooms: { some: { roomNumberSnapshot: { contains: search, mode: 'insensitive' } } } } },
  ];
  const [items, total, pending, history, toReturn] = await prisma.$transaction([
    prisma.correctionRequest.findMany({ where, include, skip: (page - 1) * limit, take: limit, orderBy: status === 'Pending' ? [{ createdAt: 'asc' }, { requestId: 'asc' }] : [{ reviewedAt: 'desc' }, { requestId: 'desc' }] }),
    prisma.correctionRequest.count({ where }),
    prisma.correctionRequest.count({ where: { ...scope, status: 'Pending' } }),
    prisma.correctionRequest.count({ where: { ...scope, ...reviewed } }),
    prisma.correctionRequest.count({ where: { ...scope, status: 'Approved', action: 'refund' } }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items: items.map(decorate), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, counts: { pending, history, toReturn } };
}
export async function approvalDetail(actor: Actor, requestId: number) {
  await manager(actor);
  if (!Number.isSafeInteger(requestId) || requestId < 1) throw new Error('Invalid approval request.');
  const request = await prisma.correctionRequest.findFirst({ where: { requestId, propertyId: actor.propertyId }, include });
  if (!request) throw Object.assign(new Error('Approval request not found for this hotel.'), { statusCode: 404 });
  return decorate(request);
}
