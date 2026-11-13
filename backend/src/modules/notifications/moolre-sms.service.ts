import { randomUUID } from 'crypto';
import { normalizeGhanaPhoneNumber } from '../../shared/utils/ghanaPhone';

const SEND_URL = 'https://api.moolre.com/open/sms/send';
const STATUS_URL = 'https://api.moolre.com/open/sms/status';
const SENDER_ID = 'HideOut24';
const REQUEST_TIMEOUT_MS = 10_000;

type ProviderJson = { status?: number; code?: string; data?: Array<{ ref?: string; status?: string | number }> };

export class MoolreSmsError extends Error {
  constructor(
    message: string,
    public readonly reference: string,
    public readonly ambiguous: boolean,
    public readonly providerCode?: string,
  ) { super(message); this.name = 'MoolreSmsError'; }
}

export function isMoolreSmsConfigured(): boolean {
  return Boolean(process.env.MOOLRE_SMS_VAS_KEY?.trim());
}

export function createMoolreReference(scope: string): string {
  const safeScope = scope.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50);
  return `${safeScope || 'sms'}-${randomUUID()}`;
}

async function postMoolre(url: string, body: unknown, reference: string): Promise<{ response: Response; json: ProviderJson }> {
  const key = process.env.MOOLRE_SMS_VAS_KEY?.trim();
  if (!key) throw new MoolreSmsError('SMS service is not configured.', reference, false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-VASKEY': key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let json: ProviderJson = {};
    try { json = await response.json() as ProviderJson; } catch { /* invalid provider body is handled below */ }
    return { response, json };
  } catch {
    throw new MoolreSmsError('SMS provider response is uncertain. Check its status before retrying.', reference, true);
  } finally { clearTimeout(timer); }
}

export async function sendMoolreSms(input: { recipient: unknown; message: string; reference?: string }) {
  const reference = input.reference || createMoolreReference('sms');
  const recipient = normalizeGhanaPhoneNumber(input.recipient);
  if (!recipient) throw new MoolreSmsError('Recipient is not a valid Ghana phone number.', reference, false);
  const message = input.message.trim();
  if (!message) throw new MoolreSmsError('SMS message cannot be empty.', reference, false);

  const { response, json } = await postMoolre(SEND_URL, {
    type: 1,
    senderid: SENDER_ID,
    messages: [{ recipient, message, ref: reference }],
  }, reference);
  if (!response.ok || json.status !== 1 || json.code !== 'SMS01') {
    throw new MoolreSmsError('Moolre did not accept the SMS.', reference, false, json.code);
  }
  return { reference, recipient, providerCode: json.code };
}

export async function checkMoolreSmsStatus(reference: string) {
  const ref = reference.trim();
  if (!ref) throw new MoolreSmsError('SMS reference is required.', ref, false);
  const { response, json } = await postMoolre(STATUS_URL, { type: 5, ref: [ref] }, ref);
  if (!response.ok || json.status !== 1) throw new MoolreSmsError('Could not check SMS delivery status.', ref, false, json.code);
  const match = json.data?.find(entry => entry.ref === ref);
  if (!match || match.status === undefined) throw new MoolreSmsError('Moolre returned no status for this SMS.', ref, false, json.code);
  return { reference: ref, deliveryStatus: String(match.status), providerCode: json.code };
}
