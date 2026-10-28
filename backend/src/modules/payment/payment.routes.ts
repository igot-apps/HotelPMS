import { Router, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import * as paymentService from './payment.service';
import * as subscriptionService from './subscription.service';
import { authenticate, AuthRequest } from '../../shared/middleware/auth.middleware';

const router = Router();

// Paystack mobile money can finish after the browser callback. Accept signed
// success webhooks as a second path to verification; the service re-verifies
// the transaction with Paystack and is idempotent for duplicate deliveries.
router.post('/webhooks/platform', async (req: any, res: Response) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.header('x-paystack-signature');
  if (!secret || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(401).json({ success: false, message: 'Invalid Paystack webhook.' });
  }

  const expected = createHmac('sha512', secret).update(req.body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'hex');
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid Paystack webhook signature.' });
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ success: false, message: 'Invalid Paystack webhook signature.' });
  }

  let event: any;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
  }
  if (event.event !== 'charge.success' || !event.data?.reference) return res.sendStatus(200);

  try {
    await subscriptionService.processSubscriptionWebhook(String(event.data.reference));
    return res.sendStatus(200);
  } catch (error: any) {
    // A non-subscription reference is irrelevant here; transient verification
    // errors should return 500 so Paystack retries the webhook.
    if (error.statusCode === 404) return res.sendStatus(200);
    return res.status(500).json({ success: false, message: 'Could not process subscription payment webhook.' });
  }
});

// Subscription billing routes are authenticated and always use the property
// attached to the signed-in user, never a propertyId supplied by the browser.
router.get('/subscription-status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(401).json({ success: false, message: 'Sign in to view subscription status.' });
    const data = await subscriptionService.getSubscriptionStatus(propertyId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/initialize', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const propertyId = req.user?.propertyId;
    if (!userId || !propertyId) return res.status(401).json({ success: false, message: 'Sign in to start a subscription payment.' });
    const durationMonths = Number(req.body.durationMonths);
    const data = await subscriptionService.initializeSubscriptionPayment(userId, propertyId, durationMonths);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

router.get('/verify/:reference', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(401).json({ success: false, message: 'Sign in to verify subscription payment.' });
    const reference = req.params.reference as string;
    const data = await subscriptionService.verifySubscriptionPayment(reference, propertyId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
});

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
