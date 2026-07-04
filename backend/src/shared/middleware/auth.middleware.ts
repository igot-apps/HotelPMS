import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { PrismaClient } from '../../generated/prisma'; // Adjust path if your generated folder is elsewhere

const prisma = new PrismaClient();

// Extend the AuthRequest interface to include permissions for this request lifecycle
export interface AuthRequest extends Request {
  user?: JwtPayload;
  userPermissions?: string[]; // 🚨 NEW: Stores permissions so we don't query the DB multiple times per request
}

// ==========================================
// 1. AUTHENTICATION (Unchanged)
// ==========================================
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'No token provided',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
    return;
  }

  req.user = decoded;
  next();
};

// ==========================================
// 2. ROLE CHECK (Unchanged)
// ==========================================
export const requireRole = (allowedRoleIds: number[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoleIds.includes(req.user.roleId)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

// ==========================================
// 3. PERMISSION CHECK (Fully Implemented)
// ==========================================
export const requirePermission = (...requiredPermissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    try {
      // 🚀 OPTIMIZATION: Check if permissions are already loaded in this request lifecycle
      let userPermissions = req.userPermissions;

      if (!userPermissions) {
        // Fetch the role and its permissions from the database
        const roleWithPermissions = await prisma.role.findUnique({
          where: { roleId: req.user.roleId },
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        });

        if (!roleWithPermissions) {
          res.status(403).json({
            success: false,
            message: 'Access denied. Role not found.',
          });
          return;
        }

        // Extract just the permission codes (e.g., ['CanCreateRoom', 'CanViewRooms'])
        userPermissions = roleWithPermissions.rolePermissions.map(
          (rp) => rp.permission.code
        );
        
        // 🚀 Cache on the request object so subsequent middlewares don't hit the DB again
        req.userPermissions = userPermissions;
      }

      // Check if the user has ALL the required permissions for this route
      const hasPermission = requiredPermissions.every((perm) =>
        userPermissions!.includes(perm)
      );

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
      res.status(500).json({
        success: false,
        message: 'Internal server error during authorization.',
      });
    }
  };
};

// Optional: Alias for convenience if you prefer the name 'authorize' in your routes
export const authorize = requirePermission;