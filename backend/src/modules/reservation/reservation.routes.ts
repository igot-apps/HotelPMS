import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as reservationController from './reservation.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Reservation routes
router.post('/', reservationController.createReservation);
router.get('/', reservationController.getReservations);
router.get('/date-range', reservationController.getReservationsByDateRange);
router.get('/:id', reservationController.getReservationById);
router.get('/:id/stats', reservationController.getReservationStats);
router.put('/:id', reservationController.updateReservation);
router.delete('/:id', reservationController.cancelReservation);
router.post('/:id/check-in', reservationController.checkInGuest);
router.post('/:id/check-out', reservationController.checkOutGuest);
router.patch('/rooms/:reservationRoomId/status', reservationController.updateReservationRoomStatus);


export default router;