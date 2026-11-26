import { Router, Response } from 'express';
import * as paymentService from './payment.service';
import * as subscriptionService from './subscription.service';
import { processMoolreWebhook } from './moolre-webhook.service';
import { moolreMode } from './moolre.client';
import { authenticate, AuthRequest, requirePermission } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/utils/prisma';

const router = Router();

// Moolre callback for guest bookings (RES-) and subscriptions (SUB-). The raw body is kept for the
// signature check; every outcome is re-verified with Moolre before anything is recorded.
router.post('/webhooks/moolre', async (req: any, res: Response) => {
  try {
    await processMoolreWebhook(req.body, req.header('x-moolre-signature'));
    return res.sendStatus(200);
  } catch (error: any) {
    // Never acknowledge an uncommitted payment; non-2xx lets Moolre retry.
    console.error('Moolre webhook failed:', error.message);
    return res.status(error.statusCode || 500).json({ success: false, message: 'Could not process payment webhook.' });
  }
});

// Subscription billing routes are authenticated and always use the property
// attached to the signed-in user, never a propertyId supplied by the browser.
const billing = [authenticate, requirePermission('CanManageBilling')];
const sendError = (res: Response, error: any) =>
  res.status(error.statusCode || 400).json({ success: false, message: error.message, code: error.code });

router.get('/subscription-status', ...billing, async (req: AuthRequest, res: Response) => {
  try {
    const status = await subscriptionService.getSubscriptionStatus(req.user!.propertyId!);
    return res.json({ success: true, data: { ...status, paymentTestMode: moolreMode() !== 'live' } });
  } catch (error: any) { return sendError(res, error); }
});

// Live price breakdown for the billing page; GET so expired hotels can still price a renewal.
router.get('/quote', ...billing, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query;
    const input = {
      packageCode: q.packageCode ? String(q.packageCode) : undefined,
      rooms: q.rooms === undefined ? undefined : Number(q.rooms),
      staff: q.staff === undefined ? undefined : Number(q.staff),
      months: Number(q.months),
    };
    return res.json({ success: true, data: await subscriptionService.quoteSubscription(req.user!.propertyId!, input) });
  } catch (error: any) { return sendError(res, error); }
});

router.post('/initialize', ...billing, async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const input = {
      packageCode: b.packageCode, rooms: b.rooms, staff: b.staff,
      months: Number(b.months ?? b.durationMonths),
      phone: b.phone, network: b.network,
    };
    return res.json({ success: true, data: await subscriptionService.initializeSubscriptionPayment(req.user!.userId, req.user!.propertyId!, input) });
  } catch (error: any) { return sendError(res, error); }
});

router.post('/otp', ...billing, async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ success: true, data: await subscriptionService.submitSubscriptionOtp(String(req.body?.reference || ''), req.user!.propertyId!, req.body?.otp) });
  } catch (error: any) { return sendError(res, error); }
});

router.get('/verify/:reference', ...billing, async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ success: true, data: await subscriptionService.verifySubscriptionPayment(String(req.params.reference), req.user!.propertyId!) });
  } catch (error: any) { return sendError(res, error); }
});

// ============================================================
// RECORD A NEW PAYMENT
// ============================================================
router.use(authenticate, requirePermission('CanProcessPayments'));

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const reservation = await prisma.reservation.findFirst({ where: { reservationId: req.body.reservationId, propertyId: req.user!.propertyId }, select: { reservationId: true } });
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found for this hotel.' });
    const payment = await paymentService.recordPayment({ ...req.body, receivedBy: req.user!.userId, status: 'Completed' });
    return res.status(201).json({ success: true, data: payment });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
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
    const propertyId = req.user!.propertyId;

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
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(403).json({ success: false, message: 'Payment statistics are only available for a hotel account.' });
    const stats = await paymentService.getPaymentStatistics(propertyId);
    return res.json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// GET PAYMENT BY ID
// ============================================================
router.get('/:id', async (req: any, res: Response) => {
  try {
    const payment = await paymentService.getPaymentById(parseInt(req.params.id));
    if (payment.reservation.propertyId !== req.user.propertyId) return res.status(404).json({ success: false, message: 'Payment not found.' });
    return res.json({ success: true, data: payment });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
});

// ============================================================
// UPDATE PAYMENT
// ============================================================
router.patch('/:id', async (req: any, res: Response) => {
  void req;
  return res.status(400).json({ success: false, message: 'Use the manager payment correction action on the reservation. Original payments cannot be overwritten.' });
});

// ============================================================
// PROCESS REFUND
// ============================================================
router.post('/:id/refund', requirePermission('CanIssueRefunds'), async (req: any, res: Response) => {
  try {
    const existing = await paymentService.getPaymentById(parseInt(req.params.id));
    if (existing.reservation.propertyId !== req.user.propertyId) return res.status(404).json({ success: false, message: 'Payment not found.' });
    throw new Error('Use the reservation refund workflow to preserve the full refund balance.');
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
