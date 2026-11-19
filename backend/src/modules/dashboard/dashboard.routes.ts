   import { Router } from 'express';
   import { authenticate, AuthRequest } from '../../shared/middleware/auth.middleware';
   import { prisma } from '../../shared/utils/prisma';
   import { getDashboardGlance } from './glance.service';
   import { getOwedAfterCheckout } from './owed-after-checkout.service';
   import { getMyDay } from './my-day.service';
   import { cashReconciliation, cashReconciliationRange, recordCashCount } from '../reports/cash-reconciliation.service';
   import * as dashboardController from './dashboard.controller';

   // 🚨 TRACKING BEACON
   console.log('🚨🚨🚨 DASHBOARD ROUTES FILE IS LOADING 🚨🚨🚨');

   const router = Router();
   router.use(authenticate);
   router.get('/overview', dashboardController.getOperationalOverview);
   // Today's key figures with the rows behind each one (front desk staff of the user's hotel).
   router.get('/glance', async (req: AuthRequest, res) => {
     try {
       const user = req.user as any;
       const account = await prisma.user.findFirst({ where: { userId: user.userId, propertyId: user.propertyId, isActive: true }, include: { role: true } });
       if (!account || !['Manager', 'Receptionist'].includes(account.role.roleName)) return res.status(403).json({ success: false, message: 'Front desk staff required.' });
       return res.json({ success: true, data: await getDashboardGlance(user.propertyId, account.role.roleName) });
     } catch (error: any) {
       return res.status(400).json({ success: false, message: error.message || 'Could not load today\'s figures.' });
     }
   });

   // Guests who checked out still owing money, for follow-up (front desk staff of the user's hotel).
   router.get('/owed-after-checkout', async (req: AuthRequest, res) => {
     try {
       const user = req.user as any;
       const account = await prisma.user.findFirst({ where: { userId: user.userId, propertyId: user.propertyId, isActive: true }, include: { role: true } });
       if (!account || !['Manager', 'Receptionist'].includes(account.role.roleName)) return res.status(403).json({ success: false, message: 'Front desk staff required.' });
       return res.json({ success: true, data: await getOwedAfterCheckout(user.propertyId) });
     } catch {
       return res.status(400).json({ success: false, message: 'Could not load guests who still owe money.' });
     }
   });

   // What the signed-in staff member handled today (their own figures only).
   router.get('/my-day', async (req: AuthRequest, res) => {
     try {
       const user = req.user as any;
       const account = await prisma.user.findFirst({ where: { userId: user.userId, propertyId: user.propertyId, isActive: true }, include: { role: true } });
       if (!account || !['Manager', 'Receptionist'].includes(account.role.roleName)) return res.status(403).json({ success: false, message: 'Front desk staff required.' });
       return res.json({ success: true, data: await getMyDay(user.userId, user.propertyId) });
     } catch {
       return res.status(400).json({ success: false, message: 'Could not load your figures for today.' });
     }
   });

   // End-of-day cash: managers see everyone and hotel totals; receptionists see only their own cash.
   router.get('/cash', async (req: AuthRequest, res) => {
     try {
       const actor = { userId: req.user!.userId, propertyId: req.user!.propertyId };
       // A period (from … to) gives the per-day summary; a single date gives the detailed day view.
       if (req.query.from && req.query.to && req.query.from !== req.query.to) return res.json({ success: true, data: await cashReconciliationRange(actor, req.query.from, req.query.to) });
       return res.json({ success: true, data: await cashReconciliation(actor, req.query.date || req.query.from) });
     } catch (error: any) {
       return res.status(error.statusCode || 400).json({ success: false, message: error.statusCode ? error.message : 'Could not load the cash reconciliation.' });
     }
   });
   router.post('/cash-counts', async (req: AuthRequest, res) => {
     try {
       return res.status(201).json({ success: true, data: await recordCashCount({ userId: req.user!.userId, propertyId: req.user!.propertyId }, req.body) });
     } catch (error: any) {
       return res.status(error.statusCode || 400).json({ success: false, message: error.message || 'Could not save the cash count.' });
     }
   });

   export default router;