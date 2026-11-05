import { beforeEach, expect, jest, test } from '@jest/globals';
import * as repository from '../src/modules/property/property.repository';
import { updateProperty } from '../src/modules/property/property.service';

jest.mock('../src/modules/property/property.repository', () => ({
  findPropertyById: jest.fn(),
  updateProperty: jest.fn(),
}));

const findProperty = repository.findPropertyById as jest.Mock;
const saveProperty = repository.updateProperty as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findProperty.mockResolvedValue({ propertyId: 1, paystackSecretKey: 'sk_test_existing' } as never);
  saveProperty.mockResolvedValue({ propertyId: 1 } as never);
});

test('saving unrelated property details leaves the Paystack key untouched', async () => {
  await updateProperty(1, { propertyName: 'Updated hotel' });
  expect(saveProperty).toHaveBeenCalledWith(1, { propertyName: 'Updated hotel' });
});

test('a supplied key without explicit replacement consent is rejected', async () => {
  await expect(updateProperty(1, { propertyName: 'Updated hotel', paystackSecretKey: 'sk_test_accidental' }))
    .rejects.toThrow('Choose Replace Paystack key');
  expect(saveProperty).not.toHaveBeenCalled();
});

test('explicit replacement saves the new key', async () => {
  await updateProperty(1, { paystackSecretKey: 'sk_test_replacement', replacePaystackSecretKey: true });
  expect(saveProperty).toHaveBeenCalledWith(1, { paystackSecretKey: 'sk_test_replacement' });
});
