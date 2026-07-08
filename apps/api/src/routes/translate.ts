import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { translateBatch, type TranslateDeps } from '../i18n/translate.js';
import { checkTranslateRate } from '../i18n/rate-limit.js';

const Body = z.object({
  texts: z.array(z.string().min(1)).min(1).max(50),
  targetLocale: z.enum(['en', 'pt-BR']),
  context: z.enum(['finding', 'generation', 'material', 'help']),
});

export const translateRoutes: FastifyPluginAsync<TranslateDeps> = async (
  app: FastifyInstance,
  deps,
) => {
  app.post('/api/translate', async (req, reply) => {
    const rate = checkTranslateRate(req.ip);
    if (!rate.allowed) {
      reply.header('retry-after', String(Math.ceil(rate.retryAfterMs / 1000)));
      return reply.code(429).send({ error: 'rate limit exceeded' });
    }

    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const out = await translateBatch(deps, parsed.data);
      return out;
    } catch (e) {
      if (e instanceof Error && e.message === 'no_llm_provider') {
        return reply.code(503).send({ error: 'no_llm_provider' });
      }
      throw e;
    }
  });
};
