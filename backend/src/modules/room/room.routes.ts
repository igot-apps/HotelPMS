import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';

// Import all controllers
import * as roomTypeController from './room-type.controller';
import * as roomController from './room.controller';
import * as ratePlanController from './rate-plan.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================================
// Room Type Routes
// ============================================================
router.post('/types', roomTypeController.createRoomType);
router.get('/types', roomTypeController.getRoomTypes);
router.get('/types/:id', roomTypeController.getRoomTypeById);
router.get('/types/:id/stats', roomTypeController.getRoomTypeStats);
router.put('/types/:id', roomTypeController.updateRoomType);
router.delete('/types/:id', roomTypeController.deleteRoomType);

// ============================================================
// Rate Plan Routes (MUST come BEFORE /:id routes)
// ============================================================
router.post('/rate-plans', ratePlanController.createRatePlan);
router.get('/rate-plans', ratePlanController.getRatePlans);
router.get('/rate-plans/:id', ratePlanController.getRatePlanById);
router.put('/rate-plans/:id', ratePlanController.updateRatePlan);
router.delete('/rate-plans/:id', ratePlanController.deleteRatePlan);

// ============================================================
// Room Routes (/:id routes go LAST)
// ============================================================
router.post('/', roomController.createRoom);
router.get('/', roomController.getRooms);
router.get('/available', roomController.getAvailableRooms);
router.get('/:id', roomController.getRoomById);
router.put('/:id', roomController.updateRoom);
router.patch('/:id/status', roomController.updateRoomStatus);
router.delete('/:id', roomController.deleteRoom);

export default router;