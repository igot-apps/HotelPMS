import { Request, Response } from 'express';
import { loginSchema, refreshTokenSchema } from '../../shared/utils/validation';
import * as authService from './auth.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

export const login = async (req: Request, res: Response) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        // ✅ FIX: Zod v4 uses .issues instead of .errors
        errors: result.error.issues,
      });
    }

    const { username, password } = result.data;
    const loginResult = await authService.loginUser(username, password);

    if (!loginResult.success) {
      return res.status(401).json({
        success: false,
        message: loginResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: loginResult.accessToken,
        refreshToken: loginResult.refreshToken,
        user: loginResult.user,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const result = refreshTokenSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        // ✅ FIX: Zod v4 uses .issues instead of .errors
        errors: result.error.issues,
      });
    }

    const refreshResult = await authService.refreshAccessToken(
      result.data.refreshToken
    );

    if (!refreshResult.success) {
      return res.status(401).json({
        success: false,
        message: refreshResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: refreshResult.accessToken,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const user = await authService.getUserById(req.user.userId, req.user.propertyId || 0);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const logout = async (_req: AuthRequest, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

export const registerHotel = async (req: Request, res: Response) => {
  try {
    const {
      hotelName, slug, email, phone, area, city, region,
      latitude, longitude, ownerName, ownerEmail, password,
    } = req.body;

    // Basic validation
    if (!hotelName || !slug || !ownerEmail || !password || !area || !city || !region) {
      return res.status(400).json({
        success: false,
        message: 'Hotel name, URL, location area, city, region, owner email, and password are required.'
      });
    }

    const { parseOptionalCoordinates } = await import('../../shared/utils/ghana-coordinates');
    let coordinates;
    try { coordinates = parseOptionalCoordinates(latitude, longitude); }
    catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }

    const result = await authService.registerNewHotel({
      hotelName,
      slug,
      email,
      phone,
      area: String(area).trim(),
      city: String(city).trim(),
      region: String(region).trim(),
      ...coordinates,
      ownerName,
      ownerEmail,
      password,
    });

    return res.status(201).json({
      success: true,
      message: 'Hotel registered successfully! Welcome aboard.',
      data: result, // Contains user, accessToken, refreshToken
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to register hotel',
    });
  }
}


// Owners: move this session to another property they manage (fresh tokens).
export const switchProperty = async (req: AuthRequest, res: Response) => {
  try {
    const result = await authService.switchProperty(req.user!.userId, Number(req.body?.propertyId));
    if (!result.success) return res.status(403).json(result);
    return res.json({ success: true, data: { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken } });
  } catch (error) {
    console.error('Switch property error:', error);
    return res.status(500).json({ success: false, message: 'Could not switch property. Please try again.' });
  }
};

// Owners: add another property to the same account.
export const addProperty = async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const { parseOptionalCoordinates } = await import('../../shared/utils/ghana-coordinates');
    let coordinates;
    try { coordinates = parseOptionalCoordinates(body.latitude, body.longitude); }
    catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
    const property = await authService.addOwnedProperty(req.user!.userId, {
      hotelName: String(body.hotelName || ''), slug: String(body.slug || ''),
      email: String(body.email || '').trim(), phone: String(body.phone || '').trim(),
      area: String(body.area || '').trim(), city: String(body.city || '').trim(), region: String(body.region || '').trim(),
      ...coordinates,
    });
    return res.status(201).json({ success: true, message: 'Property added. Subscribe on Billing & Plan to start using it.', data: property });
  } catch (error: any) {
    return res.status(error?.statusCode || 400).json({ success: false, message: error?.message || 'Could not add the property.' });
  }
};

// Owners: delete a branch they added that has never been subscribed.
export const deleteBranch = async (req: AuthRequest, res: Response) => {
  try {
    const result = await authService.deleteOwnedBranch(req.user!.userId, Number(req.params.id), req.user!.propertyId || 0);
    return res.json({ success: true, message: `${result.propertyName} was deleted.`, data: result });
  } catch (error: any) {
    return res.status(error?.statusCode || 400).json({ success: false, message: error?.message || 'Could not delete the property.' });
  }
};
