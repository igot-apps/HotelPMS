import { Router } from 'express';
import {  refreshToken, login, getMe, logout, registerHotel } from './auth.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';

const router = Router();


 // 🌟 PUBLIC ROUTES (No authentication required)
router.post('/login', login);
router.post('/refresh-token', refreshToken);

// ✅ NEW: Public Hotel Registration (B2B SaaS Onboarding)
router.post('/register-hotel', registerHotel); 



 router.post('/login', login);
 router.post('/refresh-token', refreshToken);
 router.post('/logout', authenticate, logout);
 router.get('/me', authenticate, getMe);


export default router;