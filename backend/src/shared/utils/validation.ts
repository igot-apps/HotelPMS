import { z } from 'zod';

// Login validation schema
export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
});

// Refresh token schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

// User creation schema
export const createUserSchema = z.object({
  fullName: z.string().min(2).max(200),
  username: z.string().min(3).max(50),
  email: z.string().email().optional(),
  password: z.string().min(6).max(100),
  roleId: z.number().int().positive(),
  propertyId: z.number().int().positive().optional(),
});

// Tenant creation schema
export const createTenantSchema = z.object({
  tenantCode: z.string().min(2).max(20),
  businessName: z.string().min(2).max(200),
  legalName: z.string().optional(),
  country: z.string().min(2).max(100),
  primaryEmail: z.string().email().optional(),
  primaryPhone: z.string().optional(),
  subscriptionPlan: z.string().default('Starter'),
});