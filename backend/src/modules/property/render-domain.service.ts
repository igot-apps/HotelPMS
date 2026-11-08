import { resolve4, resolveCname } from 'node:dns/promises';

const serviceId = () => process.env.RENDER_FRONTEND_SERVICE_ID?.trim();
const apiKey = () => process.env.RENDER_API_KEY?.trim();
export const frontendHost = () => process.env.RENDER_FRONTEND_HOST?.trim() || 'hotelpms-frontend.onrender.com';

export class DomainSetupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function renderRequest(path: string, init: RequestInit = {}): Promise<any> {
  if (!serviceId() || !apiKey()) throw new DomainSetupError('Domain automation is not configured. Set the Render API key and frontend service ID on the backend.', 503);
  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId()!)}/custom-domains${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    if (response.status === 409) throw new DomainSetupError('This domain is already connected to a Render service.', 409);
    if (response.status === 401 || response.status === 403) throw new DomainSetupError('Render domain access is not configured correctly.', 503);
    if (response.status === 402) throw new DomainSetupError('Render requires billing details before another domain can be added.', 503);
    throw new DomainSetupError(`Render could not process this domain (HTTP ${response.status}). Try again later.`, 503);
  }
  return response.status === 204 || response.status === 202 ? null : response.json();
}

export async function listRenderDomains() {
  const domains: any[] = [];
  let cursor = '';
  do {
    const page = await renderRequest(`?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    domains.push(...page.map((item: any) => item.customDomain || item));
    cursor = page.length === 100 ? page[page.length - 1]?.cursor || '' : '';
  } while (cursor);
  return domains;
}

export async function addRenderDomain(hostname: string) {
  return renderRequest('', { method: 'POST', body: JSON.stringify({ name: hostname }) });
}

export async function getRenderDomain(hostname: string) {
  return renderRequest(`/${encodeURIComponent(hostname)}`);
}

export async function triggerRenderVerification(hostname: string) {
  return renderRequest(`/${encodeURIComponent(hostname)}/verify`, { method: 'POST' });
}

export async function removeRenderDomain(hostname: string) {
  return renderRequest(`/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
}

export async function verifyDomainReadiness(hostname: string, trigger = false) {
  if (trigger) await triggerRenderVerification(hostname);
  const render = await getRenderDomain(hostname);
  if (render.verificationStatus !== 'verified') return { ready: false, status: 'waiting_for_dns', message: 'Add the DNS record shown below, then check again.' };
  try {
    if (render.domainType === 'subdomain') {
      const aliases = await resolveCname(hostname);
      if (!aliases.some(value => value.replace(/\.$/, '').toLowerCase() === frontendHost().toLowerCase())) {
        return { ready: false, status: 'dns_mismatch', message: `Point the CNAME to ${frontendHost()}, then check again.` };
      }
    } else if (!(await resolve4(hostname)).length) {
      return { ready: false, status: 'waiting_for_dns', message: 'The root domain has no public A record yet.' };
    }
  } catch {
    return { ready: false, status: 'waiting_for_dns', message: 'DNS has not reached public resolvers yet. Check the record and try again shortly.' };
  }
  try {
    const response = await fetch(`https://${hostname}/`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (response.status >= 500) return { ready: false, status: 'securing_website', message: 'Render verified DNS. HTTPS routing is still starting; check again shortly.' };
    return { ready: true, status: 'ready', message: 'DNS and HTTPS are ready.' };
  } catch {
    return { ready: false, status: 'securing_website', message: 'DNS is verified. Wait for the HTTPS certificate, then check again.' };
  }
}
