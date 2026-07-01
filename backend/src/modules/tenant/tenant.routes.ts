import { Router } from 'express';
import {
  createTenant,
  getTenants,
  getTenantById,
  getTenantStats,
  updateTenant,
  deleteTenant,
} from './tenant.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Tenant routes
router.post('/', createTenant);
router.get('/', getTenants);
router.get('/:id', getTenantById);
router.get('/:id/stats', getTenantStats);
router.put('/:id', updateTenant);
router.delete('/:id', deleteTenant);

export default router;