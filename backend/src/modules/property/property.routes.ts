import { Router } from 'express';
import {
  createProperty,
  getProperties,
  getPropertyById,
  getPropertiesByTenant,
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
router.get('/tenant/:id', getPropertiesByTenant);
router.get('/:id', getPropertyById);
router.get('/:id/stats', getPropertyStats);
router.put('/:id', updateProperty);
router.delete('/:id', deleteProperty);

export default router;