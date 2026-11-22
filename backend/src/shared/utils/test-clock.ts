// TEST ONLY: lets a tester move the server's "today" forward (e.g. to check out a 3-night stay now).
// Off unless ENABLE_TEST_CLOCK=true, and never on when NODE_ENV=production.
// When on, every `new Date()` / `Date.now()` in the server is shifted by an offset, the HTTP `Date`
// header follows it (the screens use that header as their clock), and Prisma's automatic
// createdAt / paymentDate / recordedAt / updatedAt values use the shifted time too.
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const testClockEnabled =
  process.env.ENABLE_TEST_CLOCK === 'true' && process.env.NODE_ENV !== 'production';

const RealDate = Date;
// Kept outside the project so saving it does not restart the dev server; survives restarts.
const STATE_FILE = path.join(os.tmpdir(), 'hotelpms-test-clock.json');
let offsetMs = 0;

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (Number.isFinite(saved?.offsetMs)) offsetMs = saved.offsetMs;
  } catch { /* no saved offset */ }
}

export const realNow = () => RealDate.now();
export const getTestClockOffset = () => offsetMs;

export function setTestClockOffset(ms: number) {
  if (!testClockEnabled) throw new Error('Test clock is off');
  offsetMs = Math.round(ms);
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ offsetMs })); } catch { /* keep in memory only */ }
}

if (testClockEnabled) {
  load();
  class ShiftedDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(RealDate.now() + offsetMs);
      else super(...(args as [any]));
    }
    static now() { return RealDate.now() + offsetMs; }
  }
  (globalThis as any).Date = ShiftedDate;
  console.warn('⏰ TEST CLOCK is ON (ENABLE_TEST_CLOCK=true). Do not use with real hotel data.');
}

// Fields Prisma would otherwise fill with the real time.
const AUTO_TIME_FIELDS = ['createdAt', 'paymentDate', 'recordedAt', 'updatedAt'];

// Wrap the Prisma client so its automatic timestamps follow the test clock. Unchanged when off.
export function withTestClock<T>(client: T): T {
  if (!testClockEnabled) return client;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Prisma } = require('../../generated/prisma');
  const fieldsByModel = new Map<string, Set<string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    fieldsByModel.set(model.name, new Set(model.fields.map((f: any) => f.name).filter((n: string) => AUTO_TIME_FIELDS.includes(n))));
  }
  const stamp = (model: string, data: any, onCreate: boolean) => {
    if (!offsetMs || !data || typeof data !== 'object') return;
    const now = new Date();
    for (const field of fieldsByModel.get(model) ?? []) {
      if (!onCreate && field !== 'updatedAt') continue;
      if (data[field] === undefined) data[field] = now;
    }
  };
  const each = (model: string, data: any, onCreate: boolean) =>
    (Array.isArray(data) ? data : [data]).forEach(row => stamp(model, row, onCreate));
  return (client as any).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          if (operation === 'create' || operation === 'createMany' || operation === 'createManyAndReturn') each(model, args.data, true);
          else if (operation === 'update' || operation === 'updateMany' || operation === 'updateManyAndReturn') each(model, args.data, false);
          else if (operation === 'upsert') { each(model, args.create, true); each(model, args.update, false); }
          return query(args);
        },
      },
    },
  }) as T;
}
