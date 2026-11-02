import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/auth.middleware';
import * as reservationController from './reservation.controller';
import * as recovery from './recovery.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/:id/corrections', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await recovery.correctionHistory(String(req.params.id), { userId: req.user!.userId, propertyId: req.user!.propertyId }) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});
router.post('/:id/corrections', requirePermission('CanManageStaffAndRoles'), async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await recovery.correctBooking(String(req.params.id), { userId: req.user!.userId, propertyId: req.user!.propertyId }, req.body) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

// Reservation routes
router.post('/', reservationController.createReservation);
router.get('/', reservationController.getReservations);
router.get('/date-range', reservationController.getReservationsByDateRange);
router.get('/:id', reservationController.getReservationById);
router.get('/:id/stats', reservationController.getReservationStats);
router.put('/:id', reservationController.updateReservation);
router.delete('/:id', requirePermission('CanCancelReservation'), reservationController.cancelReservation);
router.post('/:id/refund', requirePermission('CanCancelReservation'), reservationController.refundReservation);
router.post('/:id/check-in', requirePermission('CanCheckInGuest'), reservationController.checkInGuest);
router.post('/:id/check-out', requirePermission('CanCheckOutGuest'), reservationController.checkOutGuest);

// 🌟 Individual Reservation Room Status Update
router.patch('/rooms/:reservationRoomId/status', (req, res, next) => requirePermission(req.body.status === 'CheckedIn' ? 'CanCheckInGuest' : 'CanCheckOutGuest')(req, res, next), reservationController.updateReservationRoomStatus);
router.patch('/rooms/:reservationRoomId/extend', requirePermission('CanManageRates'), reservationController.extendReservationRoom);
router.patch('/rooms/:reservationRoomId/occupant', reservationController.updateOccupantName);
router.patch('/rooms/:reservationRoomId/presence', reservationController.updateGuestPresence);
router.patch('/:id/no-show', reservationController.markAsNoShow);
export default router;
