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

    if (!fullName || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Full name, phone, and password are required' });
    }

    // Check if guest already exists by phone
    const existingGuest = await prisma.platformGuest.findUnique({ where: { phone } });
    if (existingGuest) {
      return res.status(400).json({ success: false, message: 'An account with this phone number already exists. Please login instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newGuest = await prisma.platformGuest.create({
      data: {
        fullName,
        phone,
        email: email || null,
        passwordHash,
        isPhoneVerified: false, // Will be updated when OTP is implemented
        isEmailVerified: false,
      },
      select: { guestId: true, fullName: true, phone: true, email: true }
    });

    // Generate JWT for the guest
    const token = jwt.sign({ platformGuestId: newGuest.guestId, type: 'guest' }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ 
      success: true, 
      message: 'Account created successfully!',
      data: { ...newGuest, token }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Login Platform Guest
router.post('/login', async (req: any, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password are required' });
    }

    const guest = await prisma.platformGuest.findUnique({ where: { phone } });
    if (!guest) {
      return res.status(404).json({ success: false, message: 'Guest not found. Please register first.' });
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
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;