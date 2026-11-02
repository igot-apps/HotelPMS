import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import * as reportController from './report.controller';
import { dailyOverview } from './daily-overview.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const router = Router();

// 🛡️ All report routes require the user to be authenticated
router.use(authenticate);
router.get('/daily', async (req: AuthRequest, res) => {
  try {
    if (!req.user?.propertyId) return res.status(403).json({ success: false, message: 'A hotel manager account is required.' });
    const data = await dailyOverview(req.user.userId, req.user.propertyId, req.query.date as string | undefined);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

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
