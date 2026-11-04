import { test, expect } from '@jest/globals';
import { momoPhone } from '../src/modules/reservation/refund-simulation.service';
test('simulation requires a Ghana mobile number, normalized without choosing another recipient', () => {
  for (const phone of ['0540883880', '+233 54 088 3880', '233540883880', '(054) 088-3880']) expect(momoPhone(phone)).toBe('+233540883880');
  for (const phone of [undefined, null, 540883880, '', 'hello', '+15555555555', '0301234567', '054123', '05408838800']) expect(momoPhone(phone)).toBe(null);
});
