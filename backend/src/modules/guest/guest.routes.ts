import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as guestController from './guest.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Guest routes
router.post('/', guestController.createGuest);
router.get('/', guestController.getGuests);
router.get('/search', guestController.searchGuests);
router.get('/:id', guestController.getGuestById);
router.get('/:id/stats', guestController.getGuestStats);
router.get('/:id/reservations', guestController.getGuestReservations);
router.put('/:id', guestController.updateGuest);
router.delete('/:id', guestController.deleteGuest);

export default router;