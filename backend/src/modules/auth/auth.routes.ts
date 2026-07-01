import { Router } from 'express';
import {  refreshToken, login, getMe, logout } from './auth.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';

const router = Router();



 router.post('/login', login);
 router.post('/refresh-token', refreshToken);
 router.post('/logout', authenticate, logout);
 router.get('/me', authenticate, getMe);

export default router;