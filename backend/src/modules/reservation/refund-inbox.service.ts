import { prisma } from '../../shared/utils/prisma';
import type { Actor } from './recovery.service';
async function staff(actor: Actor) {
  const user = await prisma.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
  if (!user || !['Manager', 'Receptionist'].includes(user.role.roleName)) throw Object.assign(new Error('Active hotel staff access required.'), { statusCode: 403 });
}
export async function refundInboxCount(actor: Actor) {
  await staff(actor);
  return { ready: await prisma.correctionRequest.count({ where: { propertyId: actor.propertyId, action: 'refund', status: 'Approved' } }) };
}
export async function refundInbox(actor: Actor, query: any) {
  await staff(actor);
  const status = query.status || 'Approved';
  if (!['Approved', 'Pending', 'History'].includes(status)) throw new Error('Choose ready to return, pending or history.');
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid pagination.');
  const search = typeof query.search === 'string' ? query.search.trim().slice(0,100) : '';
  const scope = { propertyId: actor.propertyId, action: 'refund' };
  const history = { in: ['Completed', 'Rejected', 'Withdrawn', 'Simulated'] };
  const where: any = { ...scope, status: status === 'History' ? history : status };
  if (search) where.OR = [
    { reservation: { confirmationCode: { contains: search, mode: 'insensitive' } } },
    { reservation: { guestNameSnapshot: { contains: search, mode: 'insensitive' } } },
    { reservation: { propertyGuest: { fullName: { contains: search, mode: 'insensitive' } } } },
    { reservation: { platformGuest: { fullName: { contains: search, mode: 'insensitive' } } } },
  ];
  const [items,total,ready,pending,historyCount] = await prisma.$transaction([
    prisma.correctionRequest.findMany({
      where, skip: (page-1)*limit, take: limit,
      orderBy: status === 'Approved' ? [{ reviewedAt: 'asc' }, { requestId: 'asc' }] : [{ createdAt: 'desc' }, { requestId: 'desc' }],
      include: {
        requester: { select: { fullName: true } }, reviewer: { select: { fullName: true } }, refund: true,
        reservation: { select: { confirmationCode: true, guestNameSnapshot: true, propertyGuest: { select: { fullName: true } }, platformGuest: { select: { fullName: true } } } },
      },
    }),
    prisma.correctionRequest.count({ where }),
    prisma.correctionRequest.count({ where: { ...scope, status: 'Approved' } }),
    prisma.correctionRequest.count({ where: { ...scope, status: 'Pending' } }),
    prisma.correctionRequest.count({ where: { ...scope, status: history } }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items: items.map(item => ({ ...item, guestName: item.reservation.guestNameSnapshot || item.reservation.propertyGuest?.fullName || item.reservation.platformGuest?.fullName || 'Guest not recorded' })), pagination: { page, limit, total, totalPages: Math.ceil(total/limit) }, counts: { ready, pending, history: historyCount } };
}
