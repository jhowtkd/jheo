import type { FastifyInstance } from 'fastify';
import { negotiateLocale } from './locale.js';
import './d.js';

/**
 * Registers the locale negotiation hook on every Fastify request.
 *
 * - `onRequest`: reads `Accept-Language` and attaches `req.locale`
 *   ('en' | 'pt-BR'). The default is `en` if the header is missing.
 *
 * - `onSend`: sets `Content-Language` on the response to the same value,
 *   unless the route already set it (lets per-route responses override).
 */
export function registerLocaleHook(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    req.locale = negotiateLocale(req.headers['accept-language']);
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (!reply.getHeader('content-language') && req.locale) {
      reply.header('content-language', req.locale);
    }
    return payload;
  });
}
