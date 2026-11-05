import { jest, test, expect, beforeEach, afterEach } from '@jest/globals';
import { deliverStaffInvitation } from '../src/shared/utils/staffEmail';
import { Resend } from 'resend';

jest.mock('resend', () => ({ Resend: jest.fn() }));
const send = jest.fn<any>();

let saved: NodeJS.ProcessEnv;
beforeEach(() => { saved = { ...process.env }; process.env.STAFF_EMAIL_MODE = 'simulation'; send.mockReset(); (Resend as jest.Mock).mockImplementation(() => ({ emails: { send } })); });
afterEach(() => { process.env = saved; });

test.each([undefined, 'http://localhost:5173', 'http://127.0.0.1:5173/'])('production invitation avoids local origin %s', async origin => {
  process.env.NODE_ENV = 'production';
  if (origin === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = origin;
  const preview = await deliverStaffInvitation('staff@example.test', 'fixture-token');
  expect(preview).toMatchObject({ mode: 'simulation', setupUrl: 'https://hotelpms-frontend.onrender.com/staff/setup#fixture-token' });
});
test('honors a configured hosted frontend and removes trailing slashes', async () => {
  process.env.NODE_ENV = 'production'; process.env.FRONTEND_URL = ' https://example.test/// ';
  const preview = await deliverStaffInvitation('staff@example.test', 'fixture-token');
  expect(preview).toMatchObject({ mode: 'simulation', setupUrl: 'https://example.test/staff/setup#fixture-token' });
});
test('keeps local development links local', async () => {
  process.env.NODE_ENV = 'development'; delete process.env.FRONTEND_URL;
  expect(await deliverStaffInvitation('staff@example.test', 'fixture-token')).toMatchObject({ mode: 'simulation', setupUrl: 'http://localhost:5173/staff/setup#fixture-token' });
});
test('still requires explicit simulation mode in production', async () => {
  process.env.NODE_ENV = 'production'; delete process.env.STAFF_EMAIL_MODE;
  delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM_EMAIL;
  await expect(deliverStaffInvitation('staff@example.test', 'fixture-token')).rejects.toThrow('requires RESEND_API_KEY and RESEND_FROM_EMAIL');
});
test('sends a private setup link with Resend and returns only a delivery ID', async () => {
  delete process.env.STAFF_EMAIL_MODE;
  process.env.RESEND_API_KEY = 'fixture-key';
  process.env.RESEND_FROM_EMAIL = 'HideOut24 <staff@mail.example.test>';
  process.env.FRONTEND_URL = 'https://hotel.example.test';
  send.mockResolvedValue({ data: { id: 'email-123' }, error: null });
  const delivery = await deliverStaffInvitation('staff@example.test', 'fixture-token', 'unique-token-hash');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    to: ['staff@example.test'],
    from: 'HideOut24 <staff@mail.example.test>',
    idempotencyKey: 'staff-invitation/unique-token-hash',
    text: expect.stringContaining('https://hotel.example.test/staff/setup#fixture-token'),
  }));
  expect(delivery).toEqual({ mode: 'resend', to: 'staff@example.test', emailId: 'email-123' });
  expect(JSON.stringify(delivery)).not.toContain('fixture-token');
});
test('rejects a Resend API error', async () => {
  delete process.env.STAFF_EMAIL_MODE;
  process.env.RESEND_API_KEY = 'fixture-key';
  process.env.RESEND_FROM_EMAIL = 'staff@mail.example.test';
  send.mockResolvedValue({ data: null, error: { message: 'Invalid sender' } });
  await expect(deliverStaffInvitation('staff@example.test', 'fixture-token')).rejects.toThrow('Invalid sender');
});
