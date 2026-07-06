import Fastify from 'fastify';
import cors from '@fastify/cors';
import { OpenAIEmbeddingProvider, OpenAIProvider, AnthropicProvider, OpenRouterProvider } from '@jheo/core';
import { loadEnv, ensureSecretKey } from './env.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { auditRoutes } from './routes/audits.js';
import { materialRoutes } from './routes/materials.js';
import { settingsRoutes } from './routes/settings.js';
import { templateRoutes } from './routes/templates.js';
import { generationRoutes } from './routes/generations.js';
import { channelRoutes } from './routes/channels.js';
import { publishRoutes } from './routes/publishes.js';
import { startWorkers, startGenerateWorkers } from './queue.js';
import { prisma as defaultPrisma } from './db.js';

async function fetchText(url: string, init?: { headers?: Record<string, string> }) {
  const headers = {
    'User-Agent': 'JHEO/0.1 (+local)',
    ...(init?.headers ?? {}),
  };
  const res = await fetch(url, { headers });
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text: await res.text(),
  };
}

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, { origin: true });
  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(auditRoutes);
  await app.register(materialRoutes);
  await app.register(settingsRoutes);
  await app.register(templateRoutes);
  await app.register(generationRoutes);
  await app.register(channelRoutes);
  await app.register(publishRoutes);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const env = loadEnv();
  ensureSecretKey(process.cwd());
  startWorkers(fetchText);

  // Resolve API keys: prefer encrypted Setting rows, fall back to env vars.
  async function resolveKey(providerEnv: string, settingKey: string): Promise<string | undefined> {
    const row = await defaultPrisma.setting.findUnique({ where: { key: settingKey } });
    if (row) {
      const env = loadEnv();
      if (!env.JHEO_SECRET_KEY) return undefined;
      const { decrypt } = await import('./crypto.js');
      return decrypt(row.valueCiphertext, env.JHEO_SECRET_KEY);
    }
    return process.env[providerEnv];
  }

  const [openaiKey, anthropicKey, openrouterKey] = await Promise.all([
    resolveKey('OPENAI_API_KEY', 'openai_api_key'),
    resolveKey('ANTHROPIC_API_KEY', 'anthropic_api_key'),
    resolveKey('OPENROUTER_API_KEY', 'openrouter_api_key'),
  ]);
  const llmProviders = {
    openai: new OpenAIProvider({ apiKey: openaiKey ?? '' }),
    anthropic: new AnthropicProvider({ apiKey: anthropicKey ?? '' }),
    openrouter: new OpenRouterProvider({ apiKey: openrouterKey ?? '' }),
  };
  const embedProvider = new OpenAIEmbeddingProvider({ apiKey: openaiKey ?? '' });
  // The LLM/embedding providers in @jheo/core expect `typeof fetch` (raw Response).
  // audit-job uses `fetchText` (a normalized {status, headers, text} shape) for
  // its HTML fetching path — keep that as-is. For the generate worker, pass the
  // global fetch directly.
  startGenerateWorkers(globalThis.fetch.bind(globalThis), embedProvider, llmProviders, defaultPrisma);

  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: env.WEB_PORT });
}