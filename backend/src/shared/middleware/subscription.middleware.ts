import { Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { AuthRequest } from './auth.middleware';

const prisma = new PrismaClient();

export const checkSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const propertyId = req.user?.propertyId;
    
    // If no propertyId (e.g., superadmin or public route), just pass through
    if (!propertyId || propertyId === 0) return next(); 

    // 🌟 ALLOW READ-ONLY ACCESS: Let them view the dashboard, rooms, and billing page
    if (req.method === 'GET') {
      return next();
    }

    const property = await prisma.property.findUnique({
      where: { propertyId },
      select: { subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true }
    });

    if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

    const now = new Date();
    
    // Check if Trial is expired
    const isTrialExpired = property.subscriptionStatus === 'Trial' && property.trialEndsAt && property.trialEndsAt < now;
    
    // Check if Paid Subscription is expired
    const isSubExpired = property.subscriptionStatus === 'Active' && property.subscriptionEndsAt && property.subscriptionEndsAt < now;

    if (isTrialExpired || isSubExpired) {
      // 🚨 SOFT LOCK: Block the write request
      return res.status(403).json({ 
        success: false, 
        message: 'Your free trial or subscription has expired. Please upgrade your plan to continue.',
        code: 'SUBSCRIPTION_EXPIRED'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};