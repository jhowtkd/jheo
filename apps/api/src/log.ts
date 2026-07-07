import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import type { FastifyRequest, FastifyReply } from 'fastify';

const isHex16 = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{16}$/i.test(s);

// `base: undefined` removes the default `{pid,hostname}` child from each log
// line. Pino's `LoggerOptions` types it as `{[k:string]:any} | null`, so we
// cast the options object through `unknown` to the explicit type to keep the
// brief's intent (no base fields) without violating `exactOptionalPropertyTypes`.
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label: string) => ({ level: label }),
    bindings: () => ({}),
  },
  timestamp: () => `,"time":${Date.now()}`,
  base: undefined,
} as unknown as pino.LoggerOptions);

// pino-http types `genReqId`/`customProps`/`customSuccessMessage`/etc. as
// `(req: IncomingMessage, res: ServerResponse) => ...`, but at runtime Fastify
// has already augmented `req` with `.id`, `.method`, `.url`. We narrow the
// type to the fields we actually read, so the intent (Fastify-shaped req) is
// preserved without weakening to `any` or the full `FastifyRequest` type
// (whose `params`/`raw`/`query`/... are not yet populated at this lifecycle
// point and would force bogus casts).
type ReqShape = { method: string; url?: string; id?: string };

// Single source of truth for x-request-id. `requestIdHook` is the FIRST
// `onRequest` hook registered in server.ts; it sets `req.id` from the
// incoming header (if a valid 16-char hex) or generates a fresh one,
// sets the response header, and stores the id on `req.id`. pino-http's
// `genReqId` then reads `req.id` and returns it. This guarantees the
// response header, the access log `requestId`, and `req.id` are the same
// value — there is no parallel id-generation path.
function deriveRequestId(req: { headers: Record<string, unknown> }): string {
  const incoming = (req.headers['x-request-id'] as string | undefined) ?? '';
  return isHex16(incoming) ? incoming : randomUUID().replace(/-/g, '').slice(0, 16);
}

export const httpLogger = pinoHttp({
  logger: log,
  genReqId: (req, res) => {
    // `requestIdHook` runs first and sets `req.id` + the response header.
    // We just mirror what it computed so pino-http's log record shares the
    // same id. If `req.id` is somehow unset (hook ordering bug), fall back
    // to a fresh generation — but only then, so the access log never lies.
    const existing = (req as { id?: string }).id;
    if (typeof existing === 'string' && existing.length > 0) {
      res.setHeader('x-request-id', existing);
      return existing;
    }
    const id = deriveRequestId(req as { headers: Record<string, unknown> });
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({ requestId: (req as ReqShape).id }),
  customSuccessMessage: (req, res) => `${(req as ReqShape).method} ${(req as ReqShape).url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${(req as ReqShape).method} ${(req as ReqShape).url} ${res.statusCode} ${err.message}`,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export function requestIdHook(req: FastifyRequest, _reply: FastifyReply, done: () => void): void {
  if (!req.id) {
    const id = deriveRequestId(req);
    req.id = id;
  }
  // Always set the response header here so the contract holds even if the
  // downstream access-log hook is reordered in the future. Cheap (header
  // set, not generated twice).
  _reply.header('x-request-id', req.id);
  done();
}

// Fastify's `app.register` is typed to accept only `FastifyPluginCallback` /
// `FastifyPluginAsync`. pino-http exports a connect-style `(req, res, next)`
// middleware (`HttpLogger`), which is structurally incompatible with either
// signature. We expose it as an `onRequest` hook instead: Fastify gives us
// `req.raw` (the IncomingMessage) and `res.raw` (the ServerResponse) which
// is exactly what pino-http's connect middleware expects. This preserves
// the brief's intent of registering the access logger as the FIRST thing
// in the request lifecycle, while satisfying both TypeScript and Fastify's
// runtime hook system.
export const httpAccessLogHook = (
  req: FastifyRequest,
  res: FastifyReply,
  done: (err?: Error) => void,
): void => {
  httpLogger(req.raw, res.raw, (err?: Error) => {
    if (err) done(err);
    else done();
  });
};
