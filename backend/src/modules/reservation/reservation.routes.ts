import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/auth.middleware';
import * as reservationController from './reservation.controller';
import * as recovery from './recovery.service';
import * as approvals from './correction-approval.service';
import * as inbox from './approval-inbox.service';
import * as refunds from './refund.service';
import * as refundQueue from './refund-inbox.service';
import * as simulation from './refund-simulation.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

const actor = (req: AuthRequest) => ({ userId: req.user!.userId, propertyId: req.user!.propertyId });
router.get('/refund-simulation/settings', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await simulation.refundSimulationSettings(actor(req)) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.put('/refund-simulation/settings', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await simulation.setRefundSimulationSettings(actor(req), req.body.enabled) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/refund-inbox/count', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await refundQueue.refundInboxCount(actor(req)) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/refund-inbox', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await refundQueue.refundInbox(actor(req), req.query) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/:id/refunds', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await refunds.refundOverview(actor(req), String(req.params.id)) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.post('/:id/refund-requests', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await refunds.requestRefund(actor(req), String(req.params.id), req.body) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.post('/refund-requests/:requestId/complete', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await refunds.completeRefund(actor(req), Number(req.params.requestId), req.body) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/approval-inbox/count', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await inbox.approvalCount(actor(req)) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/approval-inbox', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await inbox.approvalInbox(actor(req), req.query) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/approval-inbox/:requestId', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await inbox.approvalDetail(actor(req), Number(req.params.requestId)) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});
router.get('/correction-access', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await approvals.correctionAccess(actor(req)) }); }
  catch (error: any) { return res.status(403).json({ success: false, message: error.message }); }
});
router.get('/correction-requests', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await approvals.listRequests(actor(req), typeof req.query.reservationId === 'string' ? req.query.reservationId : undefined) }); }
  catch (error: any) { return res.status(403).json({ success: false, message: error.message }); }
});
router.post('/correction-requests/:requestId/preview', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await approvals.previewRequest(actor(req), Number(req.params.requestId)) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});
router.post('/correction-requests/:requestId/review', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await approvals.reviewRequest(actor(req), Number(req.params.requestId), req.body) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});
router.post('/:id/correction-requests', async (req: AuthRequest, res) => {
  try { return res.status(201).json({ success: true, data: await approvals.createRequest(actor(req), String(req.params.id), req.body) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

router.get('/:id/corrections', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await recovery.correctionHistory(String(req.params.id), { userId: req.user!.userId, propertyId: req.user!.propertyId }) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});
router.post('/:id/corrections', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await (req.body.preview === true ? recoveryPreview(req) : recovery.correctBooking(String(req.params.id), actor(req), req.body)) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

async function recoveryPreview(req: AuthRequest) {
  const { prisma } = await import('../../shared/utils/prisma');
  return prisma.$transaction(tx => recovery.correctBookingInTransaction(tx, String(req.params.id), actor(req), { ...req.body, preview: true }, true), { isolationLevel: 'Serializable', timeout: 15000 });
}

// Reservation routes
router.post('/', reservationController.createReservation);
router.get('/', reservationController.getReservations);
router.get('/date-range', reservationController.getReservationsByDateRange);
router.get('/:id', reservationController.getReservationById);
router.get('/:id/stats', reservationController.getReservationStats);
router.put('/:id', reservationController.updateReservation);
router.delete('/:id', requirePermission('CanCancelReservation'), reservationController.cancelReservation);
router.post('/:id/refund', (_req, res) => res.status(400).json({ success: false, message: 'Use Refunds on the reservation to request approval and record money returned separately.' }));
router.post('/:id/check-in', requirePermission('CanCheckInGuest'), reservationController.checkInGuest);
router.post('/:id/check-out', requirePermission('CanCheckOutGuest'), reservationController.checkOutGuest);

// 🌟 Individual Reservation Room Status Update
router.patch('/rooms/:reservationRoomId/status', (req, res, next) => requirePermission(req.body.status === 'CheckedIn' ? 'CanCheckInGuest' : 'CanCheckOutGuest')(req, res, next), reservationController.updateReservationRoomStatus);
router.patch('/rooms/:reservationRoomId/extend', requirePermission('CanManageRates'), reservationController.extendReservationRoom);
router.patch('/rooms/:reservationRoomId/occupant', requirePermission('CanCheckInGuest'), reservationController.updateOccupantName);
router.patch('/rooms/:reservationRoomId/presence', reservationController.updateGuestPresence);
router.patch('/:id/no-show', reservationController.markAsNoShow);
export default router;
