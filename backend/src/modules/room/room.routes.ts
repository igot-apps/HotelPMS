import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/auth.middleware';

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
// Only Managers can create, update, or delete room types
router.post('/types', requirePermission('CanCreateRoomType'), roomTypeController.createRoomType);
router.get('/types', roomTypeController.getRoomTypes); // Open to all authenticated staff
router.get('/types/:id', roomTypeController.getRoomTypeById);
router.get('/types/:id/stats', roomTypeController.getRoomTypeStats);
router.put('/types/:id', requirePermission('CanUpdateRoomType'), roomTypeController.updateRoomType);
router.delete('/types/:id', requirePermission('CanDeleteRoomType'), roomTypeController.deleteRoomType);

// ============================================================
// Rate Plan Routes (MUST come BEFORE /:id routes)
// ============================================================
// Only Managers can manage rates
router.post('/rate-plans', requirePermission('CanManageRates'), ratePlanController.createRatePlan);
router.get('/rate-plans', ratePlanController.getRatePlans); // Open to all authenticated staff
router.get('/rate-plans/:id', ratePlanController.getRatePlanById);
router.put('/rate-plans/:id', requirePermission('CanManageRates'), ratePlanController.updateRatePlan);
router.delete('/rate-plans/:id', requirePermission('CanManageRates'), ratePlanController.deleteRatePlan);

// ============================================================
// Room Routes (/:id routes go LAST)
// ============================================================
// Only Managers can create, update, or delete physical rooms
router.post('/', requirePermission('CanCreateRoom'), roomController.createRoom);
router.get('/', roomController.getRooms); // Open to all authenticated staff
router.get('/available', roomController.getAvailableRooms); // Open to all authenticated staff
router.get('/:id', roomController.getRoomById);

// Managers can update room details (like room number or floor)
router.put('/:id', requirePermission('CanUpdateRoom'), roomController.updateRoom);

// Housekeeping & Receptionists can update room status (Clean/Dirty/Maintenance)
router.patch('/:id/status', requirePermission('CanUpdateRoomStatus'), roomController.updateRoomStatus);

// Only Managers can delete rooms
router.delete('/:id', requirePermission('CanDeleteRoom'), roomController.deleteRoom);

export default router;