// The shared hotel staff login must never issue tokens to a platform admin (they would bypass the
// dedicated Super Admin rate limits), while hotel staff sign-in is unchanged.
import { beforeEach, expect, jest, test } from '@jest/globals';
import { loginUser } from '../src/modules/auth/auth.service';
import * as repository from '../src/modules/auth/auth.repository';

jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({
  $transaction: jest.fn(), property: { findUnique: jest.fn() }, user: { update: jest.fn() },
})) }));
jest.mock('../src/modules/payment/subscription-access', () => ({ getSubscriptionConfig: jest.fn() }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {} }));
jest.mock('../src/shared/utils/property-access', () => ({ canAccessProperty: jest.fn(), listAccessibleProperties: jest.fn<any>().mockResolvedValue([]), isPropertyOwner: jest.fn() }));
jest.mock('../src/shared/utils/password', () => ({ comparePassword: jest.fn(async (p: string, h: string) => h === `hash:${p}`), hashPassword: jest.fn() }));
jest.mock('../src/modules/auth/auth.repository', () => ({ findUserByUsernameOrEmail: jest.fn(), updateLastLogin: jest.fn(), findUserWithPermissions: jest.fn() }));

const repo = repository as any;
beforeEach(() => { jest.clearAllMocks(); });

test('platform admin with the correct password gets the same generic failure on the shared login', async () => {
  repo.findUserByUsernameOrEmail.mockResolvedValue({ userId: 1, isActive: true, propertyId: null, isPlatformAdmin: true, passwordHash: 'hash:right', role: { roleName: 'Platform Admin' } });
  const result = await loginUser('0241234567', 'right');
  expect(result).toEqual({ success: false, message: 'Invalid username or password' });
  expect(repo.updateLastLogin).not.toHaveBeenCalled();
});

test('hotel staff still sign in through the shared login', async () => {
  const staff = { userId: 7, roleId: 3, username: 'desk', isActive: true, propertyId: 2, isPlatformAdmin: false, passwordHash: 'hash:right', role: { roleName: 'Receptionist', rolePermissions: [] } };
  repo.findUserByUsernameOrEmail.mockResolvedValue(staff);
  repo.findUserWithPermissions.mockResolvedValue(staff);
  const result = await loginUser('desk', 'right');
  expect(result.success).toBe(true);
  expect(result.accessToken).toBeTruthy();
  expect(repo.updateLastLogin).toHaveBeenCalledWith(7);
});
