import { Router, Response } from 'express';
import * as paymentService from './payment.service';

const router = Router();

// ============================================================
// RECORD A NEW PAYMENT
// ============================================================
router.post('/', async (req: any, res: Response) => {
  try {
    const payment = await paymentService.recordPayment(req.body);
    res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET ALL PAYMENTS (Paginated)
// ============================================================
// ============================================================
// GET ALL PAYMENTS (Paginated)
// ============================================================
router.get('/', async (req: any, res: Response) => {
  try {
    const { page, limit, ...filters } = req.query;
    
    // 🌟 CRITICAL: Get propertyId from query, user session, or fallback to 1
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : (req.user?.propertyId || 1);

    console.log(`🔍 [ROUTE] Fetching payments for propertyId: ${propertyId}`);

    const result = await paymentService.getPayments(
      propertyId,
      filters,
      parseInt(page as string) || 1,
      parseInt(limit as string) || 10
    );

    res.json({
      success: true,
      data: result.payments,
      pagination: { page: result.page, limit: result.limit, total: result.total }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET PAYMENT STATISTICS
// ============================================================
router.get('/stats', async (req: any, res: Response) => {
  try {
    const stats = await paymentService.getPaymentStatistics(req.user?.propertyId || 1);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET PAYMENT BY ID
// ============================================================
router.get('/:id', async (req: any, res: Response) => {
  try {
    const payment = await paymentService.getPaymentById(parseInt(req.params.id));
    res.json({ success: true, data: payment });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// ============================================================
// UPDATE PAYMENT
// ============================================================
router.patch('/:id', async (req: any, res: Response) => {
  try {
    const payment = await paymentService.updatePayment(parseInt(req.params.id), req.body);
    res.json({ success: true, data: payment });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ============================================================
// PROCESS REFUND
// ============================================================
router.post('/:id/refund', async (req: any, res: Response) => {
  try {
    const payment = await paymentService.processRefund(parseInt(req.params.id));
    res.json({ success: true, data: payment });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;