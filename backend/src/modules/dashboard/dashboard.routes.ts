   import { Router } from 'express';
   import { authenticate } from '../../shared/middleware/auth.middleware';
   import * as dashboardController from './dashboard.controller';

   // 🚨 TRACKING BEACON
   console.log('🚨🚨🚨 DASHBOARD ROUTES FILE IS LOADING 🚨🚨🚨');

   const router = Router();
   router.use(authenticate);
   router.get('/overview', dashboardController.getOperationalOverview);

   export default router;