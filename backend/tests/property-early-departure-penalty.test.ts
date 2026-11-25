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
  findProperty.mockResolvedValue({ propertyId: 1 } as never);
  saveProperty.mockResolvedValue({ propertyId: 1 } as never);
});

test('the early-departure penalty is saved per property as a number', async () => {
  await updateProperty(1, { allowEarlyDepartureChargeReduction: true, earlyDepartureChargeReductionPenaltyPercent: '20' });
  expect(saveProperty).toHaveBeenCalledWith(1, { allowEarlyDepartureChargeReduction: true, earlyDepartureChargeReductionPenaltyPercent: 20 });
});

test('the early-departure penalty must be between 0 and 100%', async () => {
  for (const bad of [-1, 100.5, '', null, 'abc', true, 12.345]) {
    await expect(updateProperty(1, { earlyDepartureChargeReductionPenaltyPercent: bad })).rejects.toThrow('between 0 and 100%');
  }
  expect(saveProperty).not.toHaveBeenCalled();
  await updateProperty(1, { earlyDepartureChargeReductionPenaltyPercent: 0 });
  await updateProperty(1, { earlyDepartureChargeReductionPenaltyPercent: 100 });
  expect(saveProperty).toHaveBeenCalledTimes(2);
});
