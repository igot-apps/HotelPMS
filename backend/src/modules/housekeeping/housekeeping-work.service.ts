import { prisma } from '../../shared/utils/prisma';
import { notifyStaffLater } from '../notifications/push.service';

/**
 * Cleaning in progress (who is cleaning which room) and room issue reports.
 * No approvals: every action is recorded in the Activity Log.
 */
export const ISSUE_CATEGORIES = ['Electrical', 'Plumbing', 'Damaged furniture', 'Missing item', 'Lost property', 'Other'] as const;

type Actor = { userId: number; propertyId: number };
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const CLEAR = { cleaningStartedById: null, cleaningStartedAt: null };
export const clearCleaning = () => ({ ...CLEAR });

async function staff(userId: number) {
  const user = await prisma.user.findUnique({ where: { userId }, select: { fullName: true, role: { select: { roleName: true } } } });
  return { name: user?.fullName || 'Staff', isHousekeeper: user?.role.roleName === 'Housekeeper' };
}

async function housekeepingOn(tx: any, propertyId: number) {
  const property = await tx.property.findUnique({ where: { propertyId }, select: { housekeepingEnabled: true } });
  if (!property?.housekeepingEnabled) throw fail('Housekeeping is off for this property.', 403);
}

const roomSelect = { roomId: true, roomNumber: true, operationalStatus: true, housekeepingStatus: true, cleaningStartedById: true, cleaningStartedAt: true, cleaningStartedBy: { select: { fullName: true } } };

/** A cleaner takes a room that needs cleaning. Only one person at a time. */
export async function startCleaning(actor: Actor, roomId: number) {
  return prisma.$transaction(async tx => {
    await housekeepingOn(tx, actor.propertyId);
    const room = await tx.room.findFirst({ where: { roomId, propertyId: actor.propertyId }, select: roomSelect });
    if (!room) throw fail('Room not found.', 404);
    if (room.operationalStatus !== 'Available' || room.housekeepingStatus !== 'Dirty') throw fail(`Room ${room.roomNumber} does not need cleaning right now. Refresh the list.`, 409);
    if (room.cleaningStartedById === actor.userId) return room;
    if (room.cleaningStartedById) throw fail(`${room.cleaningStartedBy?.fullName || 'Someone'} is already cleaning room ${room.roomNumber}.`, 409);
    const startedAt = new Date();
    const changed = await tx.room.updateMany({ where: { roomId, propertyId: actor.propertyId, operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null }, data: { cleaningStartedById: actor.userId, cleaningStartedAt: startedAt } });
    if (!changed.count) throw fail('Someone else just started this room. Refresh the list.', 409);
    await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Room', action: 'CleaningStarted', oldData: { roomId }, newData: { roomId, roomNumber: room.roomNumber, startedAt: startedAt.toISOString() } } });
    return tx.room.findUnique({ where: { roomId }, select: roomSelect });
  });
}

/** Put a room back in the queue. The person cleaning it can, and so can reception or a manager (for a forgotten room). */
export async function releaseCleaning(actor: Actor, roomId: number) {
  const me = await staff(actor.userId);
  return prisma.$transaction(async tx => {
    await housekeepingOn(tx, actor.propertyId);
    const room = await tx.room.findFirst({ where: { roomId, propertyId: actor.propertyId }, select: roomSelect });
    if (!room) throw fail('Room not found.', 404);
    if (!room.cleaningStartedById) return room;
    if (room.cleaningStartedById !== actor.userId && me.isHousekeeper) throw fail(`Only ${room.cleaningStartedBy?.fullName || 'the person cleaning it'} or reception can release room ${room.roomNumber}.`, 403);
    const changed = await tx.room.updateMany({ where: { roomId, cleaningStartedById: room.cleaningStartedById }, data: CLEAR });
    if (!changed.count) throw fail('Room status changed. Refresh the list and try again.', 409);
    await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Room', action: 'CleaningReleased',
      oldData: { roomId, cleaningStartedById: room.cleaningStartedById, startedAt: room.cleaningStartedAt?.toISOString() || null },
      newData: { roomId, roomNumber: room.roomNumber, ...(room.cleaningStartedById !== actor.userId ? { note: `Released for ${room.cleaningStartedBy?.fullName || 'another cleaner'}` } : {}) } } });
    return tx.room.findUnique({ where: { roomId }, select: roomSelect });
  });
}

/** Anyone with housekeeping access reports a problem; reception and managers are told and decide what to do. */
export async function reportIssue(actor: Actor, roomId: number, input: any) {
  const category = typeof input?.category === 'string' ? input.category : '';
  const description = typeof input?.description === 'string' ? input.description.trim().replace(/\s+/g, ' ') : '';
  const roomUnsuitable = input?.roomUnsuitable === true;
  if (!(ISSUE_CATEGORIES as readonly string[]).includes(category)) throw fail('Choose an issue category.');
  if (description.length < 3 || description.length > 500) throw fail('Describe the issue (3 to 500 characters).');
  const me = await staff(actor.userId);
  const issue = await prisma.$transaction(async tx => {
    await housekeepingOn(tx, actor.propertyId);
    const room = await tx.room.findFirst({ where: { roomId, propertyId: actor.propertyId }, select: { roomId: true, roomNumber: true } });
    if (!room) throw fail('Room not found.', 404);
    const created = await tx.roomIssue.create({ data: { propertyId: actor.propertyId, roomId, category, description, roomUnsuitable, reportedById: actor.userId } });
    await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'RoomIssue', action: 'RoomIssueReported', oldData: undefined,
      newData: { issueId: created.issueId, roomId, roomNumber: room.roomNumber, category, description, roomUnsuitable } } });
    return { ...created, roomNumber: room.roomNumber };
  });
  notifyStaffLater(actor.propertyId, ['Receptionist', 'Manager'], {
    title: issue.roomUnsuitable ? 'Room may be unsuitable for guests' : 'Room issue reported',
    body: `Room ${issue.roomNumber} · ${category}: ${description.slice(0, 120)} (${me.name})`,
    url: '/rooms', tag: `room-issue-${issue.issueId}`,
  }, { excludeUserId: actor.userId });
  return issue;
}

/** Open issues for reception and managers, newest first. */
export async function listOpenIssues(propertyId: number) {
  const issues = await prisma.roomIssue.findMany({ where: { propertyId, status: 'Open' }, orderBy: { createdAt: 'desc' }, select: {
    issueId: true, roomId: true, category: true, description: true, roomUnsuitable: true, createdAt: true,
    room: { select: { roomNumber: true, operationalStatus: true } }, reportedBy: { select: { fullName: true } },
  } });
  return issues.map(({ room, reportedBy, ...issue }) => ({ ...issue, roomNumber: room.roomNumber, roomOperationalStatus: room.operationalStatus, reportedBy: reportedBy?.fullName || null }));
}

/** Reception or a manager marks an issue as dealt with (putting the room in maintenance stays a separate choice). */
export async function resolveIssue(actor: Actor, issueId: number, note: unknown) {
  const resolutionNote = typeof note === 'string' ? note.trim().replace(/\s+/g, ' ').slice(0, 300) : '';
  return prisma.$transaction(async tx => {
    const issue = await tx.roomIssue.findFirst({ where: { issueId, propertyId: actor.propertyId }, include: { room: { select: { roomNumber: true } } } });
    if (!issue) throw fail('Issue not found.', 404);
    if (issue.status !== 'Open') throw fail('This issue is already resolved.', 409);
    const changed = await tx.roomIssue.updateMany({ where: { issueId, status: 'Open' }, data: { status: 'Resolved', resolvedById: actor.userId, resolvedAt: new Date(), resolutionNote: resolutionNote || null } });
    if (!changed.count) throw fail('This issue is already resolved.', 409);
    await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'RoomIssue', action: 'RoomIssueResolved',
      oldData: { issueId, status: 'Open' }, newData: { issueId, roomId: issue.roomId, roomNumber: issue.room.roomNumber, category: issue.category, ...(resolutionNote ? { note: resolutionNote } : {}) } } });
    return tx.roomIssue.findUnique({ where: { issueId } });
  });
}
