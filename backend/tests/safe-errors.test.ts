import { expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { finalErrorHandler, GENERIC_MESSAGE, isInternalMessage, safeErrorResponses } from '../src/shared/middleware/safe-errors';

const app = express();
app.use(safeErrorResponses);
app.use(express.json());
app.get('/readable', (_req, res) => res.status(400).json({ success: false, message: 'Room 102 is not available for these dates.' }));
app.get('/prisma', (_req, res) => res.status(400).json({ success: false, message: 'Invalid `prisma.platformGuest.create()` invocation: Null constraint violation on the fields: (`passwordHash`)' }));
app.get('/thrown', () => { throw new Error("Cannot read properties of undefined (reading 'id')"); });
app.post('/json', (_req, res) => res.json({ success: true }));
app.get('/ok', (_req, res) => res.json({ success: true, message: 'Saved' }));
app.use(finalErrorHandler);

test('keeps our own readable messages', async () => {
  const res = await request(app).get('/readable');
  expect(res.status).toBe(400);
  expect(res.body.message).toBe('Room 102 is not available for these dates.');
});

test('hides database and code internals behind a friendly message', async () => {
  for (const path of ['/prisma', '/thrown']) {
    const res = await request(app).get(path);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: GENERIC_MESSAGE });
  }
});

test('explains a broken request body and leaves successes untouched', async () => {
  const bad = await request(app).post('/json').set('Content-Type', 'application/json').send('{bad');
  expect(bad.status).toBe(400);
  expect(bad.body.message).toMatch(/not valid/);
  expect((await request(app).get('/ok')).body).toEqual({ success: true, message: 'Saved' });
});

test('recognises internal error text', () => {
  expect(isInternalMessage('P2002 Unique constraint failed')).toBe(true);
  expect(isInternalMessage('connect ECONNREFUSED 127.0.0.1:5432')).toBe(true);
  expect(isInternalMessage('Choose a valid departure date after every selected room arrival.')).toBe(false);
  expect(isInternalMessage('Paystack could not verify this payment.')).toBe(false);
});
