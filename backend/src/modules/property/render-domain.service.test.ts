import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { verifyDomainReadiness } from './render-domain.service';

const originalFetch = global.fetch;
beforeEach(() => {
  process.env.RENDER_API_KEY = 'test-secret';
  process.env.RENDER_FRONTEND_SERVICE_ID = 'srv-test';
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.RENDER_API_KEY;
  delete process.env.RENDER_FRONTEND_SERVICE_ID;
});

it('keeps a domain inactive while Render has not verified ownership', async () => {
  const requests: string[] = [];
  global.fetch = jest.fn(async (input: any) => {
    requests.push(String(input));
    return { ok: true, status: 200, json: async () => ({ name: 'royalhotel.com', verificationStatus: 'unverified' }) } as any;
  }) as typeof fetch;
  const result = await verifyDomainReadiness('royalhotel.com');
  expect(result.ready).toBe(false);
  expect(result.status).toBe('waiting_for_dns');
  expect(requests).toEqual(['https://api.render.com/v1/services/srv-test/custom-domains/royalhotel.com']);
});
