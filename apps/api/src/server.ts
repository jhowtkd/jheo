import Fastify from 'fastify';
import cors from '@fastify/cors';
import { join } from 'node:path';
import { loadEnv, ensureSecretKey } from './env.js';
import { healthRoutes } from './routes/health.js';

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, { origin: 'http://127.0.0.1:5173' });
  await app.register(healthRoutes);
  // routes/projects and routes/audits are wired in Task 11
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const env = loadEnv();
  ensureSecretKey(process.cwd());
  const app = await buildServer();
  await app.listen({ host: '127.0.0.1', port: env.WEB_PORT });
}