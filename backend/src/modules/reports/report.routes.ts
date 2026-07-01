import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as reportController from './report.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Report routes
router.get('/occupancy', reportController.getOccupancyReport);
router.get('/revenue', reportController.getRevenueReport);
router.get('/reservations', reportController.getReservationReport);
router.get('/guests', reportController.getGuestReport);
router.get('/daily-summary', reportController.getDailySummary);
router.get('/monthly-summary', reportController.getMonthlySummary);

export default router;