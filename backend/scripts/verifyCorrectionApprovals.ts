import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import reservationRoutes from '../src/modules/reservation/reservation.routes';
import { generateAccessToken } from '../src/shared/utils/jwt';
import { prisma } from '../src/shared/utils/prisma';
import { correctBooking, correctBookingInTransaction, correctionHistory } from '../src/modules/reservation/recovery.service';
import { correctionAccess, createRequest, listRequests, previewRequest, reviewRequest, setCorrectionPermissions } from '../src/modules/reservation/correction-approval.service';
import { approvalInbox, approvalCount, approvalDetail } from '../src/modules/reservation/approval-inbox.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local test database only');
  const code = `approval-${randomUUID().slice(0, 8)}`;
  const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
  const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Approval fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel' } });
  const foreign = await prisma.property.create({ data: { propertyCode: `${code}-other`, propertyName: 'Other fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel' } });
  let userIds: number[] = [];
  try {
    const manager = await prisma.user.create({ data: { propertyId: hotel.propertyId, fullName: 'Fixture manager', username: `${code}-m`, passwordHash: 'fixture-no-login', roleId: managerRole.roleId } });
    const reception = await prisma.user.create({ data: { propertyId: hotel.propertyId, fullName: 'Fixture receptionist', username: `${code}-r`, passwordHash: 'fixture-no-login', roleId: receptionRole.roleId, correctionPermissions: [] } });
    const other = await prisma.user.create({ data: { propertyId: foreign.propertyId, fullName: 'Other manager', username: `${code}-o`, passwordHash: 'fixture-no-login', roleId: managerRole.roleId } });
    userIds = [manager.userId, reception.userId, other.userId];
    const m = { userId: manager.userId, propertyId: hotel.propertyId }, r = { userId: reception.userId, propertyId: hotel.propertyId }, o = { userId: other.userId, propertyId: foreign.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 200 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '101', operationalStatus: 'Occupied', housekeepingStatus: 'Clean' } });
    const arrival = new Date('2030-01-01'), departure = new Date('2030-01-02');
    const res = await prisma.reservation.create({ data: { propertyId: hotel.propertyId, confirmationCode: code, source: 'Walk-in', checkInDate: arrival, checkOutDate: departure, status: 'InHouse', totalAmount: 200, amountPaid: 100, reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: arrival, checkOutDate: departure, agreedPricePerNight: 200, status: 'CheckedIn', actualCheckIn: new Date(), roomNumberSnapshot: '101' } }, payments: { create: { propertyId: hotel.propertyId, amount: 100, paymentMethod: 'Cash', receivedBy: reception.userId } } }, include: { reservationRooms: true, payments: true } });
    const input = { action: 'undo-checkin', stayId: res.reservationRooms[0].reservationRoomId, reason: 'Checked in the wrong reservation.' };
    const app = express(); app.use(express.json()); app.use('/api/reservations', reservationRoutes);
    const token = generateAccessToken({ ...r, roleId: receptionRole.roleId, username: reception.username });
    const auth = `Bearer ${token}`;
    const managerAuth = `Bearer ${generateAccessToken({ ...m, roleId: managerRole.roleId, username: manager.username })}`;
    assert.equal((await request(app).get('/api/reservations/approval-inbox').set('Authorization', auth)).status, 403);
    assert.equal((await request(app).get('/api/reservations/approval-inbox/count').set('Authorization', managerAuth)).body.data.pending, 0);
    assert.equal((await request(app).get('/api/reservations/correction-access').set('Authorization', auth)).status, 200);
    assert.equal((await request(app).get('/api/reservations/correction-requests').set('Authorization', auth)).status, 200);
    assert.equal((await request(app).post(`/api/reservations/${res.reservationId}/corrections`).set('Authorization', auth).send({ ...input, preview: false, requestPreview: true })).status, 400);
    const httpPreview = await request(app).post(`/api/reservations/${res.reservationId}/corrections`).set('Authorization', auth).send({ ...input, preview: true });
    assert.equal(httpPreview.status, 200);
    const preview = (body: any) => prisma.$transaction(tx => correctBookingInTransaction(tx, res.reservationId, r, { ...body, preview: true }, true), { isolationLevel: 'Serializable' });
    assert((await correctionAccess(r)).every(item => !item.canApply));
    await assert.rejects(correctBooking(res.reservationId, r, { ...input, preview: false }), /approval/);
    await assert.rejects(setCorrectionPermissions(r, reception.userId, ['undo-checkin']), /manager/);
    await assert.rejects(setCorrectionPermissions(o, reception.userId, ['undo-checkin']), /your hotel/);
    await assert.rejects(setCorrectionPermissions(m, reception.userId, ['correct-payment']), /Financial/);
    let p = await preview(input);
    const req = await createRequest(r, res.reservationId, { ...input, expectedVersion: p.version, status: 'Approved' });
    assert.equal(req.status, 'Pending');
    assert.equal((await approvalCount(m)).pending, 1);
    const inboxPage = await approvalInbox(m, { search: code, action: 'undo-checkin', page: 1, limit: 1 });
    assert.equal(inboxPage.pagination.total, 1);
    assert.equal(inboxPage.items[0].requestId, req.requestId);
    assert.equal(inboxPage.items[0].needsReview, false);
    assert.equal((await approvalInbox(o, {})).pagination.total, 0);
    await assert.rejects(approvalDetail(o, req.requestId), /not found/);
    await assert.rejects(approvalDetail(r, req.requestId), /manager/);
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId } })).status, 'InHouse');
    await assert.rejects(createRequest(r, res.reservationId, { ...input, expectedVersion: p.version }), /already have/);
    await assert.rejects(reviewRequest(r, req.requestId, { decision: 'approve', expectedVersion: p.version }), /manager/);
    await assert.rejects(previewRequest(o, req.requestId), /not found/);
    assert.equal((await listRequests(o)).length, 0);
    const impact = await previewRequest(m, req.requestId);
    const race = await Promise.allSettled([reviewRequest(m, req.requestId, { decision: 'approve', expectedVersion: impact.version }), reviewRequest(m, req.requestId, { decision: 'approve', expectedVersion: impact.version })]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: input.stayId } })).status, 'Reserved');
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { roomId: room.roomId } })).housekeepingStatus, 'Dirty');
    assert((await correctionHistory(res.reservationId, r)).some(log => log.action === 'CorrectionRequestApproved'));
    assert.equal((await approvalCount(m)).pending, 0);
    const historyPage = await request(app).get('/api/reservations/approval-inbox?status=Approved').set('Authorization', managerAuth);
    assert.equal(historyPage.status, 200);
    assert.equal(historyPage.body.data.items[0].status, 'Approved');

    // Cash corrections always require approval and preserve the original ledger entry.
    const paymentInput = { action: 'correct-payment', paymentId: res.payments[0].paymentId, newAmount: 50, reason: 'Cash amount entered incorrectly.' };
    p = await preview(paymentInput);
    const cashReq = await createRequest(r, res.reservationId, { ...paymentInput, expectedVersion: p.version });
    await previewRequest(m, cashReq.requestId);
    await reviewRequest(m, cashReq.requestId, { decision: 'approve', expectedVersion: p.version });
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { paymentId: paymentInput.paymentId } })).status, 'Voided');
    assert.equal(Number((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId } })).amountPaid), 50);
    assert.equal(await prisma.payment.count({ where: { reservationId: res.reservationId } }), 2);

    // A changed booking invalidates approval and leaves both request and payment unchanged.
    const nextPayment = await prisma.payment.findFirstOrThrow({ where: { reservationId: res.reservationId, status: 'Completed' } });
    const staleInput = { ...paymentInput, paymentId: nextPayment.paymentId, newAmount: 25 };
    p = await preview(staleInput);
    const staleReq = await createRequest(r, res.reservationId, { ...staleInput, expectedVersion: p.version });
    await prisma.reservation.update({ where: { reservationId: res.reservationId }, data: { notes: 'Changed after request' } });
    assert.equal((await approvalDetail(m, staleReq.requestId)).needsReview, true);
    assert.equal((await approvalInbox(m, { status: 'Pending' })).items.find(item => item.requestId === staleReq.requestId)!.needsReview, true);
    await assert.rejects(previewRequest(m, staleReq.requestId), /changed/);
    await assert.rejects(reviewRequest(m, staleReq.requestId, { decision: 'approve', expectedVersion: p.version }), /changed/);
    assert.equal((await prisma.correctionRequest.findUniqueOrThrow({ where: { requestId: staleReq.requestId } })).status, 'Pending');
    await reviewRequest(m, staleReq.requestId, { decision: 'reject', reason: 'Details changed. Submit an updated request.' });
    assert.equal(Number((await prisma.payment.findUniqueOrThrow({ where: { paymentId: nextPayment.paymentId } })).amount), 50);
    p = await preview(staleInput);
    const withdrawn = await createRequest(r, res.reservationId, { ...staleInput, expectedVersion: p.version });
    await reviewRequest(r, withdrawn.requestId, { decision: 'withdraw' });
    assert.equal((await prisma.correctionRequest.findUniqueOrThrow({ where: { requestId: withdrawn.requestId } })).status, 'Withdrawn');

    await setCorrectionPermissions(m, reception.userId, ['undo-checkin']);
    await prisma.room.update({ where: { roomId: room.roomId }, data: { operationalStatus: 'Occupied' } });
    await prisma.reservationRoom.update({ where: { reservationRoomId: input.stayId }, data: { status: 'CheckedIn', actualCheckIn: new Date() } });
    await prisma.reservation.update({ where: { reservationId: res.reservationId }, data: { status: 'InHouse' } });
    const direct = await correctBooking(res.reservationId, r, { ...input, preview: true });
    await setCorrectionPermissions(m, reception.userId, []);
    await assert.rejects(correctBooking(res.reservationId, r, { ...input, preview: false, expectedVersion: direct.version }), /approval/);
    await setCorrectionPermissions(m, reception.userId, ['undo-checkin']);
    await correctBooking(res.reservationId, r, { ...input, preview: false, expectedVersion: direct.version });
    await prisma.user.update({ where: { userId: reception.userId }, data: { isActive: false } });
    await assert.rejects(correctionAccess(r), /Active/);
    assert.equal((await request(app).get('/api/reservations/correction-access').set('Authorization', auth)).status, 401);

    // A cancelled booking cannot be restored over a new guest's room allocation.
    await prisma.user.update({ where: { userId: reception.userId }, data: { isActive: true } });
    await prisma.reservationRoom.update({ where: { reservationRoomId: input.stayId }, data: { status: 'Cancelled', actualCheckIn: null } });
    await prisma.reservation.update({ where: { reservationId: res.reservationId }, data: { status: 'Cancelled', refundDue: 50, refundStatus: 'Pending' } });
    const restoreInput = { action: 'restore', reason: 'Cancelled the wrong reservation by mistake.' };
    p = await preview(restoreInput);
    const restoreReq = await createRequest(r, res.reservationId, { ...restoreInput, expectedVersion: p.version });
    await prisma.reservation.create({ data: { propertyId: hotel.propertyId, confirmationCode: `${code}-clash`, status: 'Confirmed', checkInDate: arrival, checkOutDate: departure, reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: arrival, checkOutDate: departure, agreedPricePerNight: 200 } } } });
    await assert.rejects(reviewRequest(m, restoreReq.requestId, { decision: 'approve', expectedVersion: p.version }), /conflicting/);
    assert.equal((await prisma.correctionRequest.findUniqueOrThrow({ where: { requestId: restoreReq.requestId } })).status, 'Pending');
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId } })).status, 'Cancelled');
    // Count all pending requests, including ones beyond the current list page.
    const existingCount = (await approvalCount(m)).pending;
    await prisma.correctionRequest.createMany({ data: Array.from({ length: 23 }, (_, index) => ({ propertyId: hotel.propertyId, reservationId: res.reservationId, requestedBy: reception.userId, action: 'undo-checkin', expectedVersion: 'fixture', input: { reason: `Pagination fixture ${index}` }, createdAt: new Date(Date.now() + index * 1000) })) });
    const pageOne = await approvalInbox(m, { limit: 20, page: 1 });
    const pageTwo = await approvalInbox(m, { limit: 20, page: 2 });
    assert.equal(pageOne.counts.pending, existingCount + 23);
    assert.equal(pageOne.items.length, 20);
    assert.equal(pageTwo.items.length, existingCount + 3);
    assert(!pageOne.items.some(first => pageTwo.items.some(second => first.requestId === second.requestId)));
    assert(pageOne.items.every(item => item.propertyId === hotel.propertyId));
    console.log('PASS: manager inbox authorization, hotel scope, exact count, filtering, history, stale flags and pagination.');
    console.log('PASS: scoped grants/revocation, request-only preview, duplicate prevention, single concurrent approval, cash ledger preservation, stale rejection, withdrawal, disabled staff and audited direct corrections.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.deleteMany({ where: { propertyId: { in: [hotel.propertyId, foreign.propertyId] } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
