import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { checkMoolreSmsStatus, MoolreSmsError, sendMoolreSms } from '../src/modules/notifications/moolre-sms.service';
import { normalizeGhanaPhoneNumber } from '../src/shared/utils/ghanaPhone';

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.MOOLRE_SMS_VAS_KEY = 'test-key-never-sent';
  global.fetch = jest.fn() as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.MOOLRE_SMS_VAS_KEY;
  jest.restoreAllMocks();
});

test.each([
  ['0596546957', '+233596546957'],
  ['596546957', '+233596546957'],
  ['233596546957', '+233596546957'],
  ['+233596546957', '+233596546957'],
  ['00233596546957', '+233596546957'],
  ['(059) 654-6957', '+233596546957'],
])('normalizes Ghana number %s', (input, expected) => {
  expect(normalizeGhanaPhoneNumber(input)).toBe(expected);
});

test.each(['+234596546957', '234596546957', '+23359654695', '05965A6957', '++233596546957', ''])('rejects unsupported or invalid number %s', input => {
  expect(normalizeGhanaPhoneNumber(input)).toBeNull();
});

test('sends the exact Moolre payload and retains the supplied reference', async () => {
  (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(new Response(JSON.stringify({ status: 1, code: 'SMS01' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expect(sendMoolreSms({ recipient: '0596546957', message: 'Test message', reference: 'booking-test-ref' })).resolves.toEqual({
    reference: 'booking-test-ref', recipient: '+233596546957', providerCode: 'SMS01',
  });
  expect(global.fetch).toHaveBeenCalledWith('https://api.moolre.com/open/sms/send', expect.objectContaining({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': 'test-key-never-sent' },
    body: JSON.stringify({ type: 1, senderid: 'HideOut24', messages: [{ recipient: '+233596546957', message: 'Test message', ref: 'booking-test-ref' }] }),
  }));
});

test('rejects HTTP success when Moolre does not return the documented acceptance code', async () => {
  (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(new Response(JSON.stringify({ status: 0, code: 'ASMS07' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expect(sendMoolreSms({ recipient: '0596546957', message: 'Test', reference: 'rejected-ref' })).rejects.toMatchObject({
    name: 'MoolreSmsError', reference: 'rejected-ref', ambiguous: false, providerCode: 'ASMS07',
  });
});

test('marks network failures ambiguous so callers check status before resending', async () => {
  (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('timeout'));
  const error = await sendMoolreSms({ recipient: '0596546957', message: 'Test', reference: 'uncertain-ref' }).catch(value => value as MoolreSmsError);
  expect(error).toMatchObject({ name: 'MoolreSmsError', reference: 'uncertain-ref', ambiguous: true });
});

test('checks delivery using the saved reference and matches the per-message result', async () => {
  (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(new Response(JSON.stringify({ status: 1, code: 'ASMQ10', data: [{ ref: 'saved-ref', status: 'DELIVERED' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await expect(checkMoolreSmsStatus('saved-ref')).resolves.toEqual({ reference: 'saved-ref', deliveryStatus: 'DELIVERED', providerCode: 'ASMQ10' });
  expect(global.fetch).toHaveBeenCalledWith('https://api.moolre.com/open/sms/status', expect.objectContaining({ body: JSON.stringify({ type: 5, ref: ['saved-ref'] }) }));
});
