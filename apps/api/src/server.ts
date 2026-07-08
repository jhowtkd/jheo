import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Worker } from 'bullmq';
import {
  OpenAIEmbeddingProvider,
  OpenAIProvider,
  AnthropicProvider,
  OpenRouterProvider,
  WordPressPublisher,
  HttpPublisher,
  AgentPublisher,
  aggregateReviewState,
} from '@jheo/core';
import { loadEnv, ensureSecretKey } from './env.js';
import { decrypt } from './crypto.js';
import { guardedFetch } from './security/url-guard.js';
import { ensureDatabaseReady } from './db-bootstrap.js';
import { responseCompressionPlugin } from './compress.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { auditRoutes } from './routes/audits.js';
import { materialRoutes } from './routes/materials.js';
import { settingsRoutes } from './routes/settings.js';
import { templateRoutes } from './routes/templates.js';
import { generationRoutes } from './routes/generations.js';
import { channelRoutes } from './routes/channels.js';
import { gscRoutes } from './routes/gsc.js';
import { publishRoutes } from './routes/publishes.js';
import { pageRoutes } from './routes/pages.js';
import { translateRoutes } from './routes/translate.js';
import type { TranslateDeps } from './i18n/translate.js';
import {
  startWorkers,
  startGenerateWorkers,
  startPublishWorkers,
  startGscWorkers,
  publishQueue,
  auditQueue,
  generateQueue,
  gscQueue,
  auditPageQueue,
  auditPageConcurrency,
  type PageAuditJobData,
} from './queue.js';
import { makePageAuditHandler } from './jobs/page-audit-job.js';
import { prisma as defaultPrisma } from './db.js';
import { httpAccessLogHook, requestIdHook } from './log.js';
import { startGscCron } from './gsc-cron.js';
import { registerLocaleHook } from './i18n/hook.js';

/**
 * Server-side HTML fetcher used by the audit pipeline. Routes every URL
 * through guardedFetch so the same SSRF / size-cap / timeout guarantees apply
 * across the entire attack surface (route handlers + workers).
 */
export async function fetchText(
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) {
  const headers = {
    'User-Agent': 'JHEO/0.1 (+local)',
    ...(init?.headers ?? {}),
  };
  // 5 MB cap and 15s default timeout — plugins only need a few hundred KB
  // of markup; anything bigger is almost certainly an attack.
  const res = await guardedFetch(url, {
    headers,
    ...(init?.signal ? { signal: init.signal } : {}),
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 15_000,
  });
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text: await res.text(),
  };
}

export async function buildServer(opts?: { llmProviders?: TranslateDeps['llmProviders'] }) {
  const env = loadEnv();
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    // Hard per-request body cap. The materials POST handler further trims
    // source per-type, but this is the outer guard against multi-MB JSON.
    bodyLimit: 1024 * 1024,
    // A reasonable connection timeout so a TCP-level stall doesn't pin a
    // worker slot indefinitely.
    connectionTimeout: 30_000,
  });

  // --- Structured access logging (pino-http) -----------------------------
  // Registered as the FIRST hook so every request gets a stable requestId
  // and a structured access log line, regardless of what other plugins do.
  app.addHook('onRequest', requestIdHook);
  app.addHook('onRequest', httpAccessLogHook);

  // --- Locale negotiation (F6) ------------------------------------------
  // Registered after logging so logging always runs first, and before any
  // route so every handler can read `req.locale`. The `onSend` hook echoes
  // `Content-Language` unless a route already set it.
  registerLocaleHook(app);

  // --- In-process rate limiter ------------------------------------------
  // Token-bucket, keyed by `${ip}:${method}:${url}`. Routes opt in by
  // passing `config: { rateLimit: { max, windowMs } }`; everything else
  // passes through untouched. Avoids pulling in @fastify/rate-limit just
  // for the handful of routes that actually need it.
  const buckets = new Map<string, { tokens: number; last: number }>();
  const BURST = 20;
  const REFILL_PER_SEC = 5;
  // Track which routes opted in (registered in preParsing/onRequest prep).
  app.addHook('onRoute', (routeOptions) => {
    const cfg = routeOptions.config as { rateLimit?: { max: number; windowMs: number } };
    if (cfg?.rateLimit) {
      // No-op: just verifying config is captured. The actual rate check
      // happens in onRequest after the route is matched (so routeOptions
      // is populated and stable).
      routeOptions.config = { ...routeOptions.config, rateLimit: cfg.rateLimit };
    }
  });
  app.addHook('onRequest', async (req, reply) => {
    const cfg = (req.routeOptions?.config ?? {}) as { rateLimit?: { max: number; windowMs: number } };
    const limit = cfg.rateLimit;
    if (!limit) return;
    const key = `${req.ip}:${req.routeOptions.method}:${req.routeOptions.url}`;
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: BURST, last: now };
    const elapsed = (now - b.last) / 1000;
    b.tokens = Math.min(BURST, b.tokens + elapsed * REFILL_PER_SEC);
    b.last = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      reply.code(429);
      return { error: 'rate limit exceeded' };
    }
    b.tokens -= 1;
    buckets.set(key, b);
  });

  // --- Security headers (in place of @fastify/helmet) -------------------
  app.addHook('onSend', async (_req, reply, payload) => {
    const setIfMissing = (name: string, value: string) => {
      if (!reply.getHeader(name)) reply.header(name, value);
    };
    setIfMissing('X-Content-Type-Options', 'nosniff');
    setIfMissing('X-Frame-Options', 'DENY');
    setIfMissing('Referrer-Policy', 'no-referrer');
    return payload;
  });

  await app.register(cors, { origin: true });
  await app.register(responseCompressionPlugin);
  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(auditRoutes);
  await app.register(materialRoutes);
  await app.register(settingsRoutes);
  await app.register(templateRoutes);
  await app.register(generationRoutes);
  await app.register(channelRoutes);
  await app.register(gscRoutes);
  await app.register(publishRoutes);
  await app.register(pageRoutes);
  await app.register(translateRoutes, {
    prisma: defaultPrisma,
    llmProviders:
      opts?.llmProviders ?? {
        openai: new OpenAIProvider({ apiKey: '' }),
        anthropic: new AnthropicProvider({ apiKey: '' }),
        openrouter: new OpenRouterProvider({ apiKey: '' }),
      },
    fetchFn: globalThis.fetch,
  });
  return app;
}

/**
 * Construct the live-process LLM providers from env + resolved keys. Kept
 * separate from `buildServer` so `buildServer({ llmProviders })` can be
 * called from tests with stub providers without going through env parsing.
 */
function buildLlmProviders(
  env: ReturnType<typeof loadEnv>,
  keys: { openai?: string | undefined; anthropic?: string | undefined; openrouter?: string | undefined },
) {
  return {
    openai: new OpenAIProvider({
      apiKey: keys.openai ?? '',
      ...(env.OPENAI_BASE_URL ? { baseUrl: env.OPENAI_BASE_URL } : {}),
    }),
    anthropic: new AnthropicProvider({ apiKey: keys.anthropic ?? '' }),
    openrouter: new OpenRouterProvider({ apiKey: keys.openrouter ?? '' }),
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const env = loadEnv();
  ensureSecretKey(process.cwd());
  const auditWorker = startWorkers(fetchText);
  const pageAuditWorker = new Worker<PageAuditJobData>(
    'auditPage',
    makePageAuditHandler({ fetchText }),
    {
      connection: {
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      concurrency: auditPageConcurrency,
    },
  );

  // Resolve API keys: prefer encrypted Setting rows, fall back to env vars.
  async function resolveKey(providerEnv: string, settingKey: string): Promise<string | undefined> {
    const row = await defaultPrisma.setting.findUnique({ where: { key: settingKey } });
    if (row) {
      if (!env.JHEO_SECRET_KEY) return undefined;
      return decrypt(row.valueCiphertext, env.JHEO_SECRET_KEY);
    }
    return process.env[providerEnv];
  }

  const [openaiKey, anthropicKey, openrouterKey, embeddingKey] = await Promise.all([
    resolveKey('OPENAI_API_KEY', 'openai_api_key'),
    resolveKey('ANTHROPIC_API_KEY', 'anthropic_api_key'),
    resolveKey('OPENROUTER_API_KEY', 'openrouter_api_key'),
    resolveKey('OPENAI_EMBEDDING_API_KEY', 'openai_embedding_api_key'),
  ]);
  // When OPENAI_BASE_URL is set (e.g. MiniMax), the OpenAIProvider used for
  // completion routes through it. The embedding provider stays on the real
  // OpenAI API via the separate `openai_embedding_api_key` slot.
  const llmProviders = buildLlmProviders(env, {
    openai: openaiKey,
    anthropic: anthropicKey,
    openrouter: openrouterKey,
  });
  const embedProvider = new OpenAIEmbeddingProvider({
    apiKey: embeddingKey ?? openaiKey ?? '',
  });
  // The LLM/embedding providers in @jheo/core expect `typeof fetch` (raw Response).
  // audit-job uses `fetchText` (a normalized {status, headers, text} shape) for
  // its HTML fetching path — keep that as-is. For the generate worker, pass the
  // global fetch directly.
  const generateWorker = startGenerateWorkers(
    globalThis.fetch.bind(globalThis),
    embedProvider,
    llmProviders,
    defaultPrisma,
  );

  const wordpress = new WordPressPublisher();
  const http = new HttpPublisher();
  const agent = new AgentPublisher();
  const publishWorker = startPublishWorkers({
    prisma: defaultPrisma,
    fetchFn: globalThis.fetch.bind(globalThis),
    publishers: { wordpress, http, agent },
    decrypt,
    aggregateState: aggregateReviewState,
    publishQueueAdd: (data) => publishQueue.add('run', data, { delay: 0 }),
    ...(env.GSC_ENABLED
      ? {
          gscInspectEnqueue: async ({
            projectId,
            inspectionUrl,
            publishId,
          }: {
            projectId: string;
            inspectionUrl: string;
            publishId: string;
          }) => {
            const connection = await defaultPrisma.gscConnection.findUnique({ where: { projectId } });
            if (!connection) return;
            await gscQueue.add(
              `gsc-inspect:${publishId}`,
              { action: 'inspect', projectId, inspectionUrl, publishId },
            );
          },
        }
      : {}),
  });

  const gscWorker = env.GSC_ENABLED
    ? startGscWorkers({
        prisma: defaultPrisma,
        decrypt,
        fetchFn: globalThis.fetch.bind(globalThis),
        secretKey: env.JHEO_SECRET_KEY,
      })
    : null;

  const app = await buildServer({ llmProviders });

  const gscCron = env.GSC_ENABLED
    ? startGscCron({
        prisma: defaultPrisma,
        gscQueue,
        log: (message, detail) => app.log.info(detail ?? {}, message),
      })
    : null;

  // Idempotent schema bootstrap: ensure pgvector + the HNSW index on
  // Material.embedding exist before the first audit or generation runs.
  // No-op on subsequent boots.
  await ensureDatabaseReady().catch((e: unknown) =>
    app.log.warn({ err: e }, 'ensureDatabaseReady failed (non-fatal)'),
  );

  // Graceful shutdown — drain HTTP, workers, Redis, Prisma on SIGTERM/SIGINT so
  // rolling deploys don't leak FDs or leave jobs half-completed.
  // BullMQ Queue.close() also closes the underlying IORedis connection for us,
  // so we don't need to reach into the (protected) connection field directly.
  // The FlowProducer used by the flow orchestrator is a module-level lazy
  // singleton inside audit-job.ts; close it here via dynamic import so we
  // keep server.ts free of a circular dependency on jobs/.
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    try {
      const { closeFlowProducer } = await import('./jobs/audit-job.js');
      await Promise.allSettled([
        app.close(),
        auditWorker.close(),
        pageAuditWorker.close(),
        generateWorker.close(),
        publishWorker.close(),
        gscWorker?.close(),
        gscCron?.stop(),
        auditQueue.close(),
        generateQueue.close(),
        publishQueue.close(),
        gscQueue.close(),
        auditPageQueue.close(),
        closeFlowProducer(),
        defaultPrisma.$disconnect(),
      ]);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: env.WEB_PORT });
}