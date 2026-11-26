import { expect, test } from '@jest/globals';
import { parseOptionalCoordinates } from '../src/shared/utils/ghana-coordinates';

test('both coordinates blank means "add later"', () => {
  for (const [lat, lng] of [['', ''], [null, null], [undefined, undefined], ['  ', '']]) {
    expect(parseOptionalCoordinates(lat, lng)).toEqual({ latitude: null, longitude: null });
  }
});

test('valid Ghana coordinates are kept as numbers', () => {
  expect(parseOptionalCoordinates('5.6037', '-0.1870')).toEqual({ latitude: 5.6037, longitude: -0.187 });
});

test('only one coordinate, or a location outside Ghana, is rejected', () => {
  expect(() => parseOptionalCoordinates('5.6', '')).toThrow('Enter both');
  expect(() => parseOptionalCoordinates('', '-0.18')).toThrow('Enter both');
  expect(() => parseOptionalCoordinates('51.5', '-0.12')).toThrow('within Ghana');
});
