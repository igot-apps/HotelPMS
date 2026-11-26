import { beforeEach, expect, jest, test } from '@jest/globals';
import * as repository from '../src/modules/property/property.repository';
import { updateProperty } from '../src/modules/property/property.service';

jest.mock('../src/modules/property/property.repository', () => ({
  findPropertyById: jest.fn(),
  updateProperty: jest.fn(),
}));

const findProperty = repository.findPropertyById as jest.Mock;
const saveProperty = repository.updateProperty as jest.Mock;
const keys = { moolreUsername: 'hotel', moolrePublicKey: 'pub_123', moolreAccountNumber: '10203040' };

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of ['MOOLRE_USER', 'MOOLRE_PUBKEY', 'MOOLRE_ACCOUNT']) delete process.env[k];
  findProperty.mockResolvedValue({ propertyId: 1, ...keys } as never);
  saveProperty.mockResolvedValue({ propertyId: 1 } as never);
});

test('saving unrelated property details leaves the Moolre keys untouched', async () => {
  await updateProperty(1, { propertyName: 'Updated hotel' });
  expect(saveProperty).toHaveBeenCalledWith(1, { propertyName: 'Updated hotel' });
});

test('supplied keys without explicit replacement consent are rejected', async () => {
  await expect(updateProperty(1, { propertyName: 'Updated hotel', moolrePublicKey: 'accidental' }))
    .rejects.toThrow('Choose Replace Moolre keys');
  expect(saveProperty).not.toHaveBeenCalled();
});

test('explicit replacement saves all keys and needs username, public key and wallet', async () => {
  await updateProperty(1, { ...keys, moolreAccountNumber: ' 555666 ', moolreWebhookSecret: 'whsec', replaceMoolreKeys: true });
  expect(saveProperty).toHaveBeenCalledWith(1, { ...keys, moolreAccountNumber: '555666', moolreWebhookSecret: 'whsec' });
  await expect(updateProperty(1, { moolreUsername: 'x', replaceMoolreKeys: true })).rejects.toThrow('public key and wallet');
  await expect(updateProperty(1, { ...keys, moolreAccountNumber: 'abc', replaceMoolreKeys: true })).rejects.toThrow('digits only');
});

test('online booking needs hotel or platform Moolre keys', async () => {
  findProperty.mockResolvedValue({ propertyId: 1 } as never);
  await expect(updateProperty(1, { isOnlineBookingEnabled: true })).rejects.toThrow('Configure Moolre keys');
  Object.assign(process.env, { MOOLRE_USER: 'p', MOOLRE_PUBKEY: 'k', MOOLRE_ACCOUNT: '1' });
  await expect(updateProperty(1, { isOnlineBookingEnabled: true })).resolves.toBeTruthy();
});

test('removing the hotel keys while online booking is on needs a platform fallback', async () => {
  findProperty.mockResolvedValue({ propertyId: 1, isOnlineBookingEnabled: true, ...keys } as never);
  await expect(updateProperty(1, { removeMoolreKeys: true })).rejects.toThrow('Configure Moolre keys');
});
