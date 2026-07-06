// backend/src/modules/user/user.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { PERMISSIONS } from '../../shared/constants/permissions';
import * as userController from './user.controller';

const router = Router();

// All routes require authentication and the Manage Staff permission
router.use(authenticate);
router.use(authorize(PERMISSIONS.CAN_MANAGE_STAFF_AND_ROLES));

// 🚨 GET ROLES MUST BE BEFORE /:id
router.get('/roles', userController.getRoles);

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deactivateUser);

export default router;