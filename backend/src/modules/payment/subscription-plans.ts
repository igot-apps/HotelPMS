// Single source of truth for subscription packages, pricing, discounts and allowances.
// The platform admin edits the config at runtime (subscription_settings row);
// DEFAULT_CONFIG is only used until that row exists.

export type PackageDef = { code: string; name: string; monthlyPrice: number; rooms: number; staff: number; active: boolean };
export type CustomDef = {
  enabled: boolean; name: string; baseFee: number; perRoom: number; perStaff: number;
  minRooms: number; maxRooms: number; minStaff: number; maxStaff: number;
};
export type SubscriptionConfig = {
  packages: PackageDef[];
  custom: CustomDef;
  minMonths: number;
  maxMonths: number;
  discounts: { minMonths: number; percent: number }[];
  trial: { days: number; rooms: number; staff: number };
};

export const CUSTOM_CODE = 'custom';

export const DEFAULT_CONFIG: SubscriptionConfig = {
  packages: [
    { code: 'standard', name: 'Standard', monthlyPrice: 200, rooms: 10, staff: 2, active: true },
    { code: 'pro', name: 'Pro', monthlyPrice: 350, rooms: 20, staff: 4, active: true },
  ],
  custom: { enabled: true, name: 'Custom', baseFee: 50, perRoom: 5, perStaff: 10, minRooms: 1, maxRooms: 200, minStaff: 1, maxStaff: 50 },
  minMonths: 1,
  maxMonths: 24,
  discounts: [
    { minMonths: 1, percent: 0 },
    { minMonths: 3, percent: 8.33 },
    { minMonths: 6, percent: 10 },
    { minMonths: 12, percent: 16.67 },
    { minMonths: 24, percent: 20 },
  ],
  trial: { days: 14, rooms: 20, staff: 5 },
};

export type Terms = {
  packageCode: string; packageName: string; roomAllowance: number; staffAllowance: number;
  monthlyPrice: number; discountPercent: number;
};
export type Override = { discountPercent?: number | null; roomAllowance?: number | null; staffAllowance?: number | null; note?: string | null };

const MONTH_MS = (365 / 12) * 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const isInt = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const isNum = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

export class SubscriptionError extends Error {
  constructor(message: string, public statusCode = 400, public code?: string) { super(message); }
}

/** Validate an admin-submitted config. Returns a normalized copy or throws. */
export function validateConfig(input: any): SubscriptionConfig {
  const fail = (msg: string) => { throw new SubscriptionError(msg); };
  if (!input || typeof input !== 'object') fail('Settings are required.');
  const packages: PackageDef[] = Array.isArray(input.packages) ? input.packages.map((p: any) => ({
    code: String(p?.code || '').trim().toLowerCase(),
    name: String(p?.name || '').trim(),
    monthlyPrice: Number(p?.monthlyPrice), rooms: Number(p?.rooms), staff: Number(p?.staff), active: p?.active !== false,
  })) : [];
  const codes = new Set<string>();
  for (const p of packages) {
    if (!/^[a-z0-9-]{2,30}$/.test(p.code) || p.code === CUSTOM_CODE) fail(`Package code "${p.code}" is invalid or reserved.`);
    if (codes.has(p.code)) fail(`Package code "${p.code}" is used twice.`);
    codes.add(p.code);
    if (!p.name || p.name.length > 50) fail('Each package needs a name of up to 50 characters.');
    if (!isNum(p.monthlyPrice, 1, 100000)) fail(`${p.name}: monthly price must be between 1 and 100,000.`);
    if (!isInt(p.rooms, 1, 10000) || !isInt(p.staff, 1, 10000)) fail(`${p.name}: room and staff allowances must be whole numbers of at least 1.`);
  }
  const c = input.custom || {};
  const custom: CustomDef = {
    enabled: c.enabled !== false, name: String(c.name || 'Custom').trim().slice(0, 50) || 'Custom',
    baseFee: Number(c.baseFee), perRoom: Number(c.perRoom), perStaff: Number(c.perStaff),
    minRooms: Number(c.minRooms), maxRooms: Number(c.maxRooms), minStaff: Number(c.minStaff), maxStaff: Number(c.maxStaff),
  };
  if (![custom.baseFee, custom.perRoom, custom.perStaff].every(n => isNum(n, 0, 100000))) fail('Custom pricing values must be between 0 and 100,000.');
  if (!isInt(custom.minRooms, 1, 10000) || !isInt(custom.maxRooms, custom.minRooms, 10000)) fail('Custom room limits: minimum must be at least 1 and not above the maximum.');
  if (!isInt(custom.minStaff, 1, 10000) || !isInt(custom.maxStaff, custom.minStaff, 10000)) fail('Custom staff limits: minimum must be at least 1 and not above the maximum.');
  if (!packages.some(p => p.active) && !custom.enabled) fail('Keep at least one package available.');
  const minMonths = Number(input.minMonths), maxMonths = Number(input.maxMonths);
  if (!isInt(minMonths, 1, 120) || !isInt(maxMonths, minMonths, 120)) fail('Durations must be whole months between 1 and 120.');
  const discounts = (Array.isArray(input.discounts) ? input.discounts : [])
    .map((d: any) => ({ minMonths: Number(d?.minMonths), percent: Number(d?.percent) }))
    .sort((a: any, b: any) => a.minMonths - b.minMonths);
  for (const d of discounts) {
    if (!isInt(d.minMonths, 1, 120) || !isNum(d.percent, 0, 90)) fail('Discounts need a whole-month threshold and a percentage between 0 and 90.');
  }
  if (new Set(discounts.map((d: any) => d.minMonths)).size !== discounts.length) fail('Each discount threshold must be unique.');
  const t = input.trial || {};
  const trial = { days: Number(t.days), rooms: Number(t.rooms), staff: Number(t.staff) };
  if (!isInt(trial.days, 1, 365) || !isInt(trial.rooms, 1, 10000) || !isInt(trial.staff, 1, 10000)) fail('Trial needs 1–365 days and room/staff allowances of at least 1.');
  return { packages, custom, minMonths, maxMonths, discounts, trial };
}

export function discountFor(config: SubscriptionConfig, months: number) {
  let percent = 0;
  for (const d of config.discounts) if (months >= d.minMonths) percent = d.percent;
  return percent;
}

export const customMonthly = (config: SubscriptionConfig, rooms: number, staff: number) =>
  round2(config.custom.baseFee + config.custom.perRoom * rooms + config.custom.perStaff * staff);

/** Resolve a package selection into allowances and an undiscounted monthly price. */
export function resolvePackage(config: SubscriptionConfig, packageCode: string, rooms?: number, staff?: number, hotelDiscount = 0) {
  const factor = 1 - hotelDiscount / 100;
  if (packageCode === CUSTOM_CODE) {
    const c = config.custom;
    if (!c.enabled) throw new SubscriptionError('The custom package is not available right now.');
    if (!isInt(rooms, c.minRooms, c.maxRooms)) throw new SubscriptionError(`Choose between ${c.minRooms} and ${c.maxRooms} rooms.`);
    if (!isInt(staff, c.minStaff, c.maxStaff)) throw new SubscriptionError(`Choose between ${c.minStaff} and ${c.maxStaff} staff accounts.`);
    return { packageCode, packageName: c.name, roomAllowance: rooms!, staffAllowance: staff!, monthlyPrice: round2(customMonthly(config, rooms!, staff!) * factor) };
  }
  const p = config.packages.find(pkg => pkg.code === packageCode && pkg.active);
  if (!p) throw new SubscriptionError('Choose an available package.');
  return { packageCode: p.code, packageName: p.name, roomAllowance: p.rooms, staffAllowance: p.staff, monthlyPrice: round2(p.monthlyPrice * factor) };
}

/** Cheapest available option that still covers the given allowances. */
export function cheapestCovering(config: SubscriptionConfig, rooms: number, staff: number, hotelDiscount = 0) {
  const options = config.packages.filter(p => p.active && p.rooms >= rooms && p.staff >= staff)
    .map(p => resolvePackage(config, p.code, undefined, undefined, hotelDiscount));
  const c = config.custom;
  if (c.enabled && rooms <= c.maxRooms && staff <= c.maxStaff) {
    options.push(resolvePackage(config, CUSTOM_CODE, Math.max(rooms, c.minRooms), Math.max(staff, c.minStaff), hotelDiscount));
  }
  // Prefer a named package on a price tie.
  return options.sort((a, b) => a.monthlyPrice - b.monthlyPrice || Number(a.packageCode === CUSTOM_CODE) - Number(b.packageCode === CUSTOM_CODE))[0] || null;
}

export type QuoteContext = {
  now: Date;
  status: string;           // Trial | Active | Expired | Cancelled
  expired: boolean;
  currentEnd: Date | null;  // end of the current trial/paid period
  current: Terms;           // terms used for comparison (scheduled terms when a change is pending)
  scheduled: (Terms & { effectiveAt: string }) | null;
  usage: { rooms: number; staff: number };
  hotelDiscount: number;
};

/** Price a purchase: renewal months at the new price plus any prorated upgrade difference. */
export function buildQuote(config: SubscriptionConfig, input: { packageCode?: string; rooms?: number; staff?: number; months?: number }, ctx: QuoteContext) {
  const months = Number(input.months ?? 0);
  const selected = resolvePackage(config, String(input.packageCode || ctx.current.packageCode), input.rooms === undefined ? undefined : Number(input.rooms), input.staff === undefined ? undefined : Number(input.staff), ctx.hotelDiscount);
  const live = !ctx.expired && !!ctx.currentEnd && ctx.currentEnd > ctx.now;
  const cur = ctx.current;
  const smaller = selected.roomAllowance < cur.roomAllowance || selected.staffAllowance < cur.staffAllowance;
  const larger = selected.roomAllowance > cur.roomAllowance || selected.staffAllowance > cur.staffAllowance;
  const kind = !live ? (ctx.status === 'Trial' ? 'New' : 'Renewal') : smaller ? 'Downgrade' : larger ? 'Upgrade' : 'Renewal';
  const paidPeriod = live && ctx.status === 'Active';

  if (ctx.scheduled && live && (selected.packageCode !== ctx.scheduled.packageCode
    || selected.roomAllowance !== ctx.scheduled.roomAllowance || selected.staffAllowance !== ctx.scheduled.staffAllowance)) {
    throw new SubscriptionError(`A change to ${ctx.scheduled.packageName} is scheduled for ${new Date(ctx.scheduled.effectiveAt).toDateString()}. You can renew that package now, or change package after it starts.`);
  }
  const canUpgradeOnly = kind === 'Upgrade' && paidPeriod;
  if (!Number.isInteger(months) || months > config.maxMonths || (months < config.minMonths && !(months === 0 && canUpgradeOnly))) {
    throw new SubscriptionError(`Choose between ${config.minMonths} and ${config.maxMonths} months${canUpgradeOnly ? ', or upgrade for the remaining period only' : ''}.`);
  }
  const over = [
    selected.roomAllowance < ctx.usage.rooms && `${ctx.usage.rooms} rooms (it allows ${selected.roomAllowance})`,
    selected.staffAllowance < ctx.usage.staff && `${ctx.usage.staff} staff accounts including managers and pending invitations (it allows ${selected.staffAllowance})`,
  ].filter(Boolean);
  if (over.length) {
    throw new SubscriptionError(`${selected.packageName} is too small for this hotel: you have ${over.join(' and ')}. Choose a bigger plan, or deactivate rooms or staff first.`, 400, 'USAGE_EXCEEDS_PACKAGE');
  }

  const discountPercent = discountFor(config, months);
  const subtotal = round2(selected.monthlyPrice * months);
  const renewalTotal = months ? Math.round(subtotal * (1 - discountPercent / 100)) : 0;
  const discountAmount = round2(subtotal - renewalTotal);

  let prorationAmount = 0;
  let remainingDays = 0;
  if (kind === 'Upgrade' && paidPeriod) {
    const remaining = ctx.currentEnd!.getTime() - ctx.now.getTime();
    remainingDays = Math.ceil(remaining / 86_400_000);
    const diff = Math.max(0, selected.monthlyPrice - cur.monthlyPrice);
    prorationAmount = round2(diff * (1 - cur.discountPercent / 100) * (remaining / MONTH_MS));
  }
  const total = round2(renewalTotal + prorationAmount);
  const appliesAt = kind === 'Downgrade' ? ctx.currentEnd!.toISOString() : ctx.now.toISOString();
  const startsAt = live ? ctx.currentEnd! : ctx.now;
  // Suggest a cheaper option: anything covering the selected allowances, or a named
  // package (with headroom) that still covers what the hotel uses today.
  const candidates = [
    cheapestCovering(config, selected.roomAllowance, selected.staffAllowance, ctx.hotelDiscount),
    ...config.packages.filter(p => p.active && p.rooms >= ctx.usage.rooms && p.staff >= ctx.usage.staff)
      .map(p => resolvePackage(config, p.code, undefined, undefined, ctx.hotelDiscount)),
  ].filter((o): o is NonNullable<typeof o> => !!o && o.monthlyPrice < selected.monthlyPrice);
  const cheaper = candidates.sort((a, b) => a.monthlyPrice - b.monthlyPrice)[0];
  const recommendation = cheaper && !ctx.scheduled
    ? { ...cheaper, monthlySaving: round2(selected.monthlyPrice - cheaper.monthlyPrice) } : null;

  return {
    ...selected, months, kind, discountPercent, subtotal, discountAmount, renewalTotal,
    prorationAmount, remainingDays, total, currency: 'GHS',
    effectiveMonthly: months ? round2(renewalTotal / months) : 0,
    appliesAt, startsAt: startsAt.toISOString(),
    endsAt: months ? addMonthsClamped(startsAt, months).toISOString() : ctx.currentEnd?.toISOString() ?? null,
    recommendation,
  };
}

export function addMonthsClamped(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}
