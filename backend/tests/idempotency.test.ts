import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// In-memory stand-in for the idempotency_records table.
const rows: any[] = [];
let nextId = 1;
const conflict = () => Object.assign(new Error('Unique constraint'), { code: 'P2002' });
jest.mock('../src/shared/utils/prisma', () => ({
  prisma: {
    idempotencyRecord: {
      create: jest.fn<any>(async ({ data }: any) => {
        if (rows.some((r) => r.scope === data.scope && r.key === data.key)) throw conflict();
        const row = { ...data, recordId: nextId++, createdAt: new Date(), responseStatus: null, responseBody: null };
        rows.push(row);
        return { recordId: row.recordId };
      }),
      findUnique: jest.fn<any>(async ({ where }: any) => rows.find((r) => r.scope === where.scope_key.scope && r.key === where.scope_key.key) || null),
      update: jest.fn<any>(async ({ where, data }: any) => Object.assign(rows.find((r) => r.recordId === where.recordId), data)),
      deleteMany: jest.fn<any>(async ({ where }: any) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if ((where.recordId && r.recordId === where.recordId) || (where.expiresAt && r.expiresAt < where.expiresAt.lt)) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      }),
    },
  },
}));

import { idempotency } from '../src/shared/middleware/idempotency';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function app(handler: express.RequestHandler, userId = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => { req.user = { userId, propertyId: 3 }; next(); });
  a.post('/pay', idempotency, handler);
  a.get('/pay', idempotency, handler);
  return a;
}

describe('idempotency middleware', () => {
  beforeEach(() => { rows.length = 0; });

  it('does the work once and replays the stored reply for the same key', async () => {
    let runs = 0;
    const a = app((_req, res) => { runs++; res.status(201).json({ success: true, paymentId: runs }); });
    const key = 'key-aaaaaaaaaaaaaaaa';
    const first = await request(a).post('/pay').set('Idempotency-Key', key).send({ amount: 100 });
    await flush();
    const second = await request(a).post('/pay').set('Idempotency-Key', key).send({ amount: 100 });
    expect(runs).toBe(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ success: true, paymentId: 1 });
    expect(second.headers['idempotent-replayed']).toBe('true');
  });

  it('runs normally without a key (older app versions)', async () => {
    let runs = 0;
    const a = app((_req, res) => { runs++; res.json({ success: true }); });
    await request(a).post('/pay').send({ amount: 100 });
    await request(a).post('/pay').send({ amount: 100 });
    expect(runs).toBe(2);
  });

  it('refuses a different request with a reused key and changes nothing', async () => {
    let runs = 0;
    const a = app((_req, res) => { runs++; res.json({ success: true }); });
    const key = 'key-bbbbbbbbbbbbbbbb';
    await request(a).post('/pay').set('Idempotency-Key', key).send({ amount: 100 });
    await flush();
    const other = await request(a).post('/pay').set('Idempotency-Key', key).send({ amount: 999 });
    expect(other.status).toBe(422);
    expect(runs).toBe(1);
  });

  it('answers 409 while the first request is still running', async () => {
    let release: () => void = () => {};
    let runs = 0;
    const a = app(async (_req, res) => { runs++; await new Promise<void>((r) => { release = r; }); res.json({ success: true }); });
    const key = 'key-cccccccccccccccc';
    const first = request(a).post('/pay').set('Idempotency-Key', key).send({ amount: 1 }).then((r) => r);
    await flush();
    const duplicate = await request(a).post('/pay').set('Idempotency-Key', key).send({ amount: 1 });
    expect(duplicate.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect(runs).toBe(1);
  });

  it('does not store server errors, so a genuine retry runs again', async () => {
    let runs = 0;
    const a = app((_req, res) => { runs++; res.status(runs === 1 ? 500 : 200).json({ success: runs > 1 }); });
    const key = 'key-dddddddddddddddd';
    expect((await request(a).post('/pay').set('Idempotency-Key', key).send({})).status).toBe(500);
    await flush();
    expect((await request(a).post('/pay').set('Idempotency-Key', key).send({})).status).toBe(200);
    expect(runs).toBe(2);
  });

  it('stores business refusals (4xx) and replays them', async () => {
    let runs = 0;
    const a = app((_req, res) => { runs++; res.status(400).json({ success: false, message: 'Room not available' }); });
    const key = 'key-eeeeeeeeeeeeeeee';
    await request(a).post('/pay').set('Idempotency-Key', key).send({});
    await flush();
    const again = await request(a).post('/pay').set('Idempotency-Key', key).send({});
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Room not available');
    expect(runs).toBe(1);
  });

  it('keeps keys separate per signed-in person', async () => {
    let runs = 0;
    const handler: express.RequestHandler = (_req, res) => { runs++; res.json({ success: true }); };
    const key = 'key-ffffffffffffffff';
    await request(app(handler, 1)).post('/pay').set('Idempotency-Key', key).send({});
    await flush();
    await request(app(handler, 2)).post('/pay').set('Idempotency-Key', key).send({});
    expect(runs).toBe(2);
  });

  it('ignores reads and rejects malformed keys', async () => {
    let runs = 0;
    const a = app((_req, res) => { runs++; res.json({ success: true }); });
    await request(a).get('/pay').set('Idempotency-Key', 'key-gggggggggggggggg');
    await request(a).get('/pay').set('Idempotency-Key', 'key-gggggggggggggggg');
    expect(runs).toBe(2);
    expect((await request(a).post('/pay').set('Idempotency-Key', 'bad key!').send({})).status).toBe(400);
  });
});
