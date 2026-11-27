import { beforeEach, expect, jest, test } from '@jest/globals';

const db: any = {
  auditLog: { findMany: jest.fn(), create: jest.fn() },
  property: { findMany: jest.fn(), findUnique: jest.fn() },
  subscriptionPayment: { findFirst: jest.fn() },
  user: { updateMany: jest.fn() },
};
const permanentlyDeleteProperty = jest.fn();
jest.mock('../src/shared/utils/prisma', () => ({ prisma: db }));
jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn().mockImplementation(() => db) }));
jest.mock('../src/modules/property/property.repository', () => ({ permanentlyDeleteProperty: (...a: any[]) => permanentlyDeleteProperty(...a) }));

import { deleteOwnedBranch } from '../src/modules/auth/auth.service';

beforeEach(() => {
  jest.clearAllMocks();
  db.auditLog.findMany.mockResolvedValue([{ entityId: 2 }]);
  db.auditLog.create.mockResolvedValue({});
  db.property.findUnique.mockResolvedValue({ propertyName: 'Branch', propertyCode: 'branch' });
  db.user.updateMany.mockResolvedValue({});
  db.subscriptionPayment.findFirst.mockResolvedValue(null);
});

test('an owner deletes a branch they added that was never subscribed', async () => {
  db.property.findMany.mockResolvedValue([{ propertyId: 2 }]);
  await expect(deleteOwnedBranch(7, 2, 1, '  branch ')).resolves.toEqual({ propertyId: 2, propertyName: 'Branch' });
  expect(permanentlyDeleteProperty).toHaveBeenCalledWith(2, 'branch');
  // The query only allows owned branches with no completed or processing subscription payment.
  const where = db.property.findMany.mock.calls[0][0].where;
  expect(where.memberships).toEqual({ some: { userId: 7, isOwner: true } });
  expect(where.subscriptionPayments).toEqual({ none: { status: { in: ['Completed', 'Processing'] } } });
  expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('PropertyDeleted');
});

test('a subscribed branch cannot be deleted', async () => {
  db.property.findMany.mockResolvedValue([]);
  db.subscriptionPayment.findFirst.mockResolvedValue({ subscriptionPaymentId: 1 });
  await expect(deleteOwnedBranch(7, 2, 1)).rejects.toThrow('has a subscription');
  expect(permanentlyDeleteProperty).not.toHaveBeenCalled();
});

test('the registered hotel (not added as a branch) cannot be deleted', async () => {
  db.auditLog.findMany.mockResolvedValue([]);
  await expect(deleteOwnedBranch(7, 1, 2)).rejects.toThrow('only delete a property you added');
  expect(permanentlyDeleteProperty).not.toHaveBeenCalled();
});

test('the property the owner is working in cannot be deleted', async () => {
  await expect(deleteOwnedBranch(7, 2, 2)).rejects.toThrow('Open another property first');
  expect(permanentlyDeleteProperty).not.toHaveBeenCalled();
});

test('the owner must type the property name to delete it', async () => {
  db.property.findMany.mockResolvedValue([{ propertyId: 2 }]);
  await expect(deleteOwnedBranch(7, 2, 1)).rejects.toThrow('Type Branch exactly');
  await expect(deleteOwnedBranch(7, 2, 1, 'Other')).rejects.toThrow('Type Branch exactly');
  expect(permanentlyDeleteProperty).not.toHaveBeenCalled();
});
