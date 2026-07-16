import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requireTenantAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  // Allow access to own tenant data
  // This will be used in controllers to filter data
  req.query.tenantId = req.user.tenantId.toString();
  
  next();
};