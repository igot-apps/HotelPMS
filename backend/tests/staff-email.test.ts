import { test, expect, beforeEach, afterEach } from '@jest/globals';
import { deliverStaffInvitation } from '../src/shared/utils/staffEmail';

let saved: NodeJS.ProcessEnv;
beforeEach(() => { saved = { ...process.env }; process.env.STAFF_EMAIL_MODE = 'simulation'; });
afterEach(() => { process.env = saved; });

test.each([undefined, 'http://localhost:5173', 'http://127.0.0.1:5173/'])('production invitation avoids local origin %s', async origin => {
  process.env.NODE_ENV = 'production';
  if (origin === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = origin;
  const preview = await deliverStaffInvitation('staff@example.test', 'fixture-token');
  expect(preview.setupUrl).toBe('https://hotelpms-frontend.onrender.com/staff/setup#fixture-token');
});
test('honors a configured hosted frontend and removes trailing slashes', async () => {
  process.env.NODE_ENV = 'production'; process.env.FRONTEND_URL = ' https://example.test/// ';
  const preview = await deliverStaffInvitation('staff@example.test', 'fixture-token');
  expect(preview.setupUrl).toBe('https://example.test/staff/setup#fixture-token');
});
test('keeps local development links local', async () => {
  process.env.NODE_ENV = 'development'; delete process.env.FRONTEND_URL;
  expect((await deliverStaffInvitation('staff@example.test', 'fixture-token')).setupUrl).toBe('http://localhost:5173/staff/setup#fixture-token');
});
test('still requires explicit simulation mode in production', async () => {
  process.env.NODE_ENV = 'production'; delete process.env.STAFF_EMAIL_MODE;
  await expect(deliverStaffInvitation('staff@example.test', 'fixture-token')).rejects.toThrow('Staff email delivery is not configured');
});
