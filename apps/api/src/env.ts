import { z } from 'zod';
// dotenv is only loaded outside production — dev convenience. In prod the
// env vars come from the orchestrator (docker compose / k8s) and pulling
// in dotenv adds boot cost + a dev dep to the runtime graph.
if (process.env.NODE_ENV !== 'production') {
  await import('dotenv/config');
}
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JHEO_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Memoize the parsed result so zod doesn't re-run on every route handler
// call. process.env is read each call so hot-reloaded env values still
// surface if the cache is invalidated.
let _env: Env | undefined;
export function loadEnv(): Env {
  if (_env === undefined) {
    _env = EnvSchema.parse(process.env);
  }
  return _env;
}

/** Test helper — drop the cached parsed env. */
export function _resetEnvForTest(): void {
  _env = undefined;
}

/**
 * Ensures a JHEO_SECRET_KEY exists by generating one and writing
 * .env.local if missing. The api binds 0.0.0.0 inside its container so
 * docker compose port-mapping works; the key protects against an accidental
 * "publish the docker compose port" scenario.
 */
export function ensureSecretKey(dir: string): string {
  const envFile = join(dir, '.env.local');
  let buf = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const m = buf.match(/^JHEO_SECRET_KEY=(.*)$/m);
  if (m && m[1]) return m[1];
  const generated = randomBytes(32).toString('base64');
  const block = buf.endsWith('\n') || buf === '' ? '' : '\n';
  buf += `${block}JHEO_SECRET_KEY=${generated}\n`;
  writeFileSync(envFile, buf, { mode: 0o600 });
  process.env.JHEO_SECRET_KEY = generated;
  return generated;
}