//auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { PrismaClient } from '../../../src/generated/prisma';
import { getSubscriptionState } from '../../modules/payment/subscription-state';

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

  try {
    const account: any = await prisma.user.findUnique({ where: { userId: decoded.userId }, select: {
      isActive: true, propertyId: true, sessionVersion: true, role: { select: { roleName: true } },
      // Owners may hold a token for another property they manage.
      memberships: { where: { propertyId: decoded.propertyId || -1, isActive: true }, select: { propertyId: true } },
    } });
    if (!account?.isActive) {
      res.status(401).json({ success: false, code: 'STAFF_ACCOUNT_DISABLED', message: 'Your staff account has been deactivated or is no longer available. Contact your manager.' });
      return;
    }
    const homeMatches = (account.propertyId || 0) === (decoded.propertyId || 0);
    const memberMatches = Boolean(decoded.propertyId) && Boolean(account.memberships?.length);
    if (!homeMatches && !memberMatches) {
      res.status(401).json({ success: false, code: 'STAFF_ACCESS_CHANGED', message: 'Your account access has changed. Please sign in again.' });
      return;
    }
    if ((account.sessionVersion || null) !== (decoded.sessionVersion || null)) {
      res.status(401).json({ success: false, code: 'STAFF_SESSION_EXPIRED', message: 'Your password changed. Please sign in again.' });
      return;
    }
    if (account.role?.roleName === 'Housekeeper' && !req.originalUrl.startsWith('/api/housekeeping/') && !req.originalUrl.startsWith('/api/auth/')) {
      res.status(403).json({ success: false, message: 'This account can access Housekeeping only.' });
      return;
    }
  } catch {
    res.status(503).json({ success: false, message: 'Could not verify account access.' });
    return;
  }

  // Attach identity only after checking current account access, never JWT alone.
  req.user = decoded;

  const isPlatformRoute = req.originalUrl.startsWith('/api/platform/');
  const isAuthRoute = req.originalUrl.startsWith('/api/auth/');
  if ((!req.user.propertyId || req.user.propertyId === 0) && !isPlatformRoute && !isAuthRoute) {
    res.status(403).json({ success: false, message: 'This account cannot access hotel-property features.' });
    return;
  }

  // 🚨 2. THE SOFT LOCK: Check subscription immediately!
  const propertyId = req.user.propertyId;
  
  // Let expired properties start a renewal payment; other writes remain locked.
  // Owners can always leave an expired property or add another (that one has its own subscription).
  const isSubscriptionPaymentInitialization = req.originalUrl === '/api/paystack/initialize'
    || req.originalUrl === '/api/auth/switch-property' || req.originalUrl === '/api/auth/properties';
  // Only block WRITE requests (POST, PUT, DELETE, PATCH). Allow GET (reading) so they can see the billing page.
  const isPlatformAdminRoute = req.originalUrl.startsWith('/api/platform/');
  if (req.method !== 'GET' && !isSubscriptionPaymentInitialization && !isPlatformAdminRoute && propertyId && propertyId !== 0) {
    try {
      const property = await prisma.property.findUnique({
        where: { propertyId },
        select: { subscriptionStatus: true, trialEndsAt: true, subscriptionEndsAt: true }
      });

      // Shared rule: Expired and Cancelled hotels, and lapsed trials/paid periods, are read-only.
      if (property && getSubscriptionState(property).expired) {
        res.status(403).json({
          success: false,
          message: 'Your subscription has expired. Please renew on Billing & Plan to continue.',
          code: 'SUBSCRIPTION_EXPIRED'
        });
        return;
      }
    } catch (error) {
      console.error('Subscription check error:', error);
    }
  }

  // 3. If all good, proceed to the route
  next();
};

export const requirePlatformAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      select: { isPlatformAdmin: true, isActive: true, propertyId: true },
    });
    if (!user?.isActive || !user.isPlatformAdmin || user.propertyId !== null) {
      res.status(403).json({ success: false, message: 'Platform administrator access required.' });
      return;
    }
    next();
  } catch (error) {
    console.error('Platform administrator authorization error:', error);
    res.status(500).json({ success: false, message: 'Could not verify platform administrator access.' });
  }
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
