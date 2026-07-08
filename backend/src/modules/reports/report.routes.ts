import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as reportController from './report.controller';

const router = Router();

// 🛡️ All report routes require the user to be authenticated
router.use(authenticate);

// ==========================================
// 🌟 MASTER ENDPOINT
// ==========================================
// Fetches Financials, Time-Series, and Categories all in ONE single request.
// This is what your main Reports Page will call.
router.get('/', reportController.getFullDashboardReport);

// ==========================================
// INDIVIDUAL ENDPOINTS
// ==========================================
// These are useful if you want to build a highly interactive dashboard where 
// only one specific chart refreshes when the user changes a filter.
router.get('/financial', reportController.getFinancialSummary);
router.get('/time-series', reportController.getRevenueTimeSeries);
router.get('/categories', reportController.getCategoryBreakdowns);

export default router;