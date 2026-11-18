   import { Router } from 'express';
   import { authenticate, AuthRequest } from '../../shared/middleware/auth.middleware';
   import { prisma } from '../../shared/utils/prisma';
   import { getDashboardGlance } from './glance.service';
   import { getOwedAfterCheckout } from './owed-after-checkout.service';
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

   export default router;