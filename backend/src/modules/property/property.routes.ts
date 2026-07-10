import { Router } from 'express';
import {
  createProperty,
  getProperties,
  getPropertyById,
  getAllActiveProperties, // ✅ CHANGED: Replaced getPropertiesByTenant
  getPropertyStats,
  updateProperty,
  deleteProperty,
} from './property.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Property routes
router.post('/', createProperty);
router.get('/', getProperties);

// ✅ CHANGED: Replaced /tenant/:id with /active
router.get('/active', getAllActiveProperties); 

router.get('/:id', getPropertyById);
router.get('/:id/stats', getPropertyStats);
router.put('/:id', updateProperty);
router.delete('/:id', deleteProperty);

export default router;