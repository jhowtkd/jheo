import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, ensureSecretKey } from './env.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { auditRoutes } from './routes/audits.js';
import { startWorkers } from './queue.js';

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'JHEO/0.1 (+local)' } });
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
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const env = loadEnv();
  ensureSecretKey(process.cwd());
  startWorkers(fetchText);
  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: env.WEB_PORT });
}
