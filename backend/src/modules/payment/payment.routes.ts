import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as paymentController from './payment.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Payment routes
router.post('/', paymentController.recordPayment);
router.get('/', paymentController.getPayments);
router.get('/statistics', paymentController.getPaymentStatistics);
router.get('/reservation/:id', paymentController.getPaymentsByReservation);
router.get('/:id', paymentController.getPaymentById);
router.put('/:id', paymentController.updatePayment);
router.delete('/:id', paymentController.deletePayment);

export default router;