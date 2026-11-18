import type { NextFunction, Request, Response } from 'express';

// Error text that comes from the database, network or code internals rather than from our own
// validation messages. It must never reach staff or guests; it is logged for developers instead.
const INTERNAL = /prisma|invocation|\bP\d{4}\b|ECONN|ETIMEDOUT|ENOTFOUND|timed out|unique constraint|foreign key|null constraint|violat|relation "|column "|syntax error|cannot read propert|is not a function|\bundefined\b|\bat .+\(.+:\d+:\d+\)/i;

export const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again; if it keeps happening, contact support.';

export function isInternalMessage(message: unknown) {
  return typeof message !== 'string' || !message.trim() || message.length > 400 || INTERNAL.test(message);
}

// Every JSON error response passes through here: our own readable messages are kept,
// internal ones are replaced with a friendly message and logged with the request.
export function safeErrorResponses(req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (body && typeof body === 'object' && body.success === false && isInternalMessage(body.message)) {
      console.error(`[hidden error] ${req.method} ${req.originalUrl} → ${res.statusCode}:`, body.message);
      body = { ...body, message: GENERIC_MESSAGE };
      if (res.statusCode < 500) res.status(500);
    }
    return json(body);
  };
  next();
}

// Last-resort handler for anything thrown or rejected inside a route.
export function finalErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'The request was not valid. Refresh the page and try again.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'That upload or request is too large.' });
  console.error(`[unhandled error] ${req.method} ${req.originalUrl}:`, err?.stack || err);
  const message = status < 500 && !isInternalMessage(err?.message) ? err.message : GENERIC_MESSAGE;
  return res.status(status).json({ success: false, message });
}
