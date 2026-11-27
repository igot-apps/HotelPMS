import { beforeEach, expect, jest, test } from '@jest/globals';

const mock = () => jest.fn<(...args: any[]) => any>();
const db: any = {
  user: { findUnique: mock() },
  property: { findUnique: mock() },
  room: { findFirst: mock(), findUnique: mock(), updateMany: mock() },
  roomIssue: { create: mock(), findMany: mock(), findFirst: mock(), updateMany: mock(), findUnique: mock() },
  auditLog: { create: mock() },
  $transaction: mock(),
};
const notify = mock();
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return db; } }));
jest.mock('../src/modules/notifications/push.service', () => ({ notifyStaffLater: (...args: any[]) => notify(...args) }));

import { releaseCleaning, reportIssue, resolveIssue, startCleaning } from '../src/modules/housekeeping/housekeeping-work.service';

const actor = { userId: 9, propertyId: 3 };
const waiting = (extra: any = {}) => ({ roomId: 7, roomNumber: '104', operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null, cleaningStartedAt: null, cleaningStartedBy: null, ...extra });
const role = (roleName: string) => db.user.findUnique.mockResolvedValue({ fullName: 'Ama', role: { roleName } });

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (work: any) => work(db));
  db.property.findUnique.mockResolvedValue({ housekeepingEnabled: true });
  db.room.updateMany.mockResolvedValue({ count: 1 });
  db.room.findUnique.mockResolvedValue({ roomId: 7 });
  db.auditLog.create.mockResolvedValue({});
  role('Housekeeper');
});

test('a cleaner starts a room waiting for cleaning; it is recorded', async () => {
  db.room.findFirst.mockResolvedValue(waiting());
  await startCleaning(actor, 7);
  expect(db.room.updateMany).toHaveBeenCalledWith({ where: { roomId: 7, propertyId: 3, operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null }, data: { cleaningStartedById: 9, cleaningStartedAt: expect.any(Date) } });
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CleaningStarted', userId: 9, newData: expect.objectContaining({ roomNumber: '104' }) }) });
});

test('cannot start a room someone else is cleaning, or one that no longer needs cleaning', async () => {
  db.room.findFirst.mockResolvedValue(waiting({ cleaningStartedById: 4, cleaningStartedBy: { fullName: 'Kofi' } }));
  await expect(startCleaning(actor, 7)).rejects.toMatchObject({ statusCode: 409, message: 'Kofi is already cleaning room 104.' });
  db.room.findFirst.mockResolvedValue(waiting({ housekeepingStatus: 'Clean' }));
  await expect(startCleaning(actor, 7)).rejects.toMatchObject({ statusCode: 409 });
  expect(db.room.updateMany).not.toHaveBeenCalled();
});

test('two cleaners tapping at once: the second one is told', async () => {
  db.room.findFirst.mockResolvedValue(waiting());
  db.room.updateMany.mockResolvedValue({ count: 0 });
  await expect(startCleaning(actor, 7)).rejects.toMatchObject({ statusCode: 409 });
  expect(db.auditLog.create).not.toHaveBeenCalled();
});

test('only the cleaner (or reception/manager) can release a room', async () => {
  db.room.findFirst.mockResolvedValue(waiting({ cleaningStartedById: 4, cleaningStartedBy: { fullName: 'Kofi' } }));
  await expect(releaseCleaning(actor, 7)).rejects.toMatchObject({ statusCode: 403 });
  role('Receptionist');
  await releaseCleaning(actor, 7);
  expect(db.room.updateMany).toHaveBeenCalledWith({ where: { roomId: 7, cleaningStartedById: 4 }, data: { cleaningStartedById: null, cleaningStartedAt: null } });
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CleaningReleased', newData: expect.objectContaining({ note: 'Released for Kofi' }) }) });
});

test('issue reports are validated, recorded and sent to reception and managers', async () => {
  await expect(reportIssue(actor, 7, { category: 'Weather', description: 'Leak' })).rejects.toMatchObject({ statusCode: 400 });
  await expect(reportIssue(actor, 7, { category: 'Plumbing', description: ' x ' })).rejects.toMatchObject({ statusCode: 400 });
  db.room.findFirst.mockResolvedValue({ roomId: 7, roomNumber: '104' });
  db.roomIssue.create.mockResolvedValue({ issueId: 11, roomUnsuitable: true });
  await reportIssue(actor, 7, { category: 'Plumbing', description: '  Tap   leaking ', roomUnsuitable: true });
  expect(db.roomIssue.create).toHaveBeenCalledWith({ data: { propertyId: 3, roomId: 7, category: 'Plumbing', description: 'Tap leaking', roomUnsuitable: true, reportedById: 9 } });
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'RoomIssueReported', entityType: 'RoomIssue' }) });
  expect(notify).toHaveBeenCalledWith(3, ['Receptionist', 'Manager'], expect.objectContaining({ title: 'Room may be unsuitable for guests', body: 'Room 104 · Plumbing: Tap leaking (Ama)' }), { excludeUserId: 9 });
});

test('a room from another property cannot be reported', async () => {
  db.room.findFirst.mockResolvedValue(null);
  await expect(reportIssue(actor, 7, { category: 'Plumbing', description: 'Tap leaking' })).rejects.toMatchObject({ statusCode: 404 });
  expect(db.room.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: 7, propertyId: 3 } }));
  expect(db.roomIssue.create).not.toHaveBeenCalled();
});

test('resolving an issue records who did it, once', async () => {
  db.roomIssue.findFirst.mockResolvedValue({ issueId: 11, roomId: 7, status: 'Open', category: 'Plumbing', room: { roomNumber: '104' } });
  db.roomIssue.updateMany.mockResolvedValue({ count: 1 });
  await resolveIssue(actor, 11, ' Plumber fixed it ');
  expect(db.roomIssue.updateMany).toHaveBeenCalledWith({ where: { issueId: 11, status: 'Open' }, data: { status: 'Resolved', resolvedById: 9, resolvedAt: expect.any(Date), resolutionNote: 'Plumber fixed it' } });
  expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'RoomIssueResolved', newData: expect.objectContaining({ note: 'Plumber fixed it' }) }) });
  db.roomIssue.findFirst.mockResolvedValue({ issueId: 11, status: 'Resolved' });
  await expect(resolveIssue(actor, 11, '')).rejects.toMatchObject({ statusCode: 409 });
});
