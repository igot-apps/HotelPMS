//auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: JwtPayload;
  userPermissions?: string[];
}

// ==========================================
// 1. AUTHENTICATION + THE "SOFT LOCK"
// ==========================================
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }

  // 1. User is verified, attach to request
  req.user = decoded;

  // 🚨 2. THE SOFT LOCK: Check subscription immediately!
  const propertyId = req.user.propertyId;
  
  // Only block WRITE requests (POST, PUT, DELETE, PATCH). Allow GET (reading) so they can see the billing page.
  if (req.method !== 'GET' && propertyId && propertyId !== 0) {
    try {
      const property = await prisma.property.findUnique({
        where: { propertyId },
        select: { subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true }
      });

      if (property) {
        const now = new Date();
        
        const isTrialExpired = property.subscriptionStatus === 'Trial' && property.trialEndsAt && property.trialEndsAt < now;
        const isSubExpired = property.subscriptionStatus === 'Active' && property.subscriptionEndsAt && property.subscriptionEndsAt < now;
        const isStatusExpired = property.subscriptionStatus === 'Expired';

        // 🚫 BLOCK THE REQUEST IF EXPIRED
        if (isTrialExpired || isSubExpired || isStatusExpired) {
          res.status(403).json({ 
            success: false, 
            message: 'Your subscription has expired. Please upgrade to continue.',
            code: 'SUBSCRIPTION_EXPIRED'
          });
          return; // STOPS THE REQUEST HERE
        }
      }
    } catch (error) {
      console.error('Subscription check error:', error);
    }
  }

  // 3. If all good, proceed to the route
  next();
};

// ==========================================
// 2. ROLE CHECK (Unchanged)
// ==========================================
export const requireRole = (allowedRoleIds: number[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!allowedRoleIds.includes(req.user.roleId)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

// ==========================================
// 3. PERMISSION CHECK (Unchanged)
// ==========================================
export const requirePermission = (...requiredPermissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    try {
      let userPermissions = req.userPermissions;
      if (!userPermissions) {
        const roleWithPermissions = await prisma.role.findUnique({
          where: { roleId: req.user.roleId },
          include: { rolePermissions: { include: { permission: true } } },
        });
        if (!roleWithPermissions) {
          res.status(403).json({ success: false, message: 'Access denied. Role not found.' });
          return;
        }
        userPermissions = roleWithPermissions.rolePermissions.map((rp) => rp.permission.code);
        req.userPermissions = userPermissions;
      }
      const hasPermission = requiredPermissions.every((perm) => userPermissions!.includes(perm));
      if (!hasPermission) {
        res.status(403).json({
          success: false,
          message: `Access denied. Missing required permission(s): ${requiredPermissions.join(', ')}`,
        });
        return;
      }
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ success: false, message: 'Internal server error during authorization.' });
    }
  };
};

export const authorize = requirePermission;