import { Router, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

// 1. Register a new Platform Guest
router.post('/register', async (req: any, res: Response) => {
  try {
    const { fullName, phone, email, password } = req.body;
    
    // 🌟 Clean inputs to prevent space mismatches
    const cleanPhone = phone?.trim();
    const cleanEmail = email?.trim() || null;

    if (!fullName || !cleanPhone || !password) {
      return res.status(400).json({ success: false, message: 'Full name, phone, and password are required' });
    }

    // Check if guest already exists by phone
    const existingGuest = await prisma.platformGuest.findUnique({ where: { phone: cleanPhone } });
    if (existingGuest) {
      return res.status(400).json({ success: false, message: 'An account with this phone number already exists. Please login instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newGuest = await prisma.platformGuest.create({
      data: {
        fullName: fullName.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        passwordHash,
        isPhoneVerified: false,
        isEmailVerified: false,
      },
      select: { guestId: true, fullName: true, phone: true, email: true }
    });

    console.log('✅ REGISTER SUCCESS: Created guest with phone:', cleanPhone);

    // Generate JWT for the guest
    const token = jwt.sign({ platformGuestId: newGuest.guestId, type: 'guest' }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ 
      success: true, 
      message: 'Account created successfully!',
      data: { ...newGuest, token }
    });
  } catch (error: any) {
    console.error('❌ REGISTER ERROR:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Login Platform Guest
router.post('/login', async (req: any, res: Response) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = phone?.trim();

    if (!cleanPhone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    console.log('🔍 LOGIN DEBUG: Attempting login with phone:', cleanPhone);

    const guest = await prisma.platformGuest.findUnique({ where: { phone: cleanPhone } });
    
    if (!guest) {
      console.log('❌ LOGIN DEBUG: Guest not found in database.');
      // 🌟 Print all guests to help us see what's actually in the DB
      const allGuests = await prisma.platformGuest.findMany({ select: { phone: true, fullName: true } });
      console.log('📋 ALL PLATFORM GUESTS IN DB:', allGuests);
      
      return res.status(404).json({ success: false, message: 'Guest not found. Please check your phone number and try again.' });
    }

    const isPasswordValid = await bcrypt.compare(password, guest.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    if (!guest.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    // Generate JWT
    const token = jwt.sign({ platformGuestId: guest.guestId, type: 'guest' }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ LOGIN SUCCESS: Guest logged in:', cleanPhone);

    return res.json({ 
      success: true, 
      message: 'Login successful!',
      data: {
        guestId: guest.guestId,
        fullName: guest.fullName,
        phone: guest.phone,
        email: guest.email,
        token
      }
    });
  } catch (error: any) {
    console.error('❌ LOGIN ERROR:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;