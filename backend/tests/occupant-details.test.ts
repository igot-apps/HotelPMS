import { test, expect } from '@jest/globals';
import { occupantDetails } from '../src/modules/reservation/occupant.service';
test('normalizes occupant details independently of the booking contact', () => {
  expect(occupantDetails('  Ada   Mensah ', '+233 54 123 4567')).toEqual({ occupantName: 'Ada Mensah', occupantPhone: '0541234567' });
  expect(occupantDetails('Ada Mensah', '')).toEqual({ occupantName: 'Ada Mensah', occupantPhone: null });
  expect(occupantDetails('Ada Mensah', undefined).occupantPhone).toBeNull();
});
test('rejects invalid details rather than guessing the occupant', () => {
  for (const name of ['', ' ', null, 123, 'x'.repeat(201)]) expect(() => occupantDetails(name, '')).toThrow();
  for (const phone of [1234567890, '0541', 'abc', '0541234567890']) expect(() => occupantDetails('Ada', phone)).toThrow();
});
