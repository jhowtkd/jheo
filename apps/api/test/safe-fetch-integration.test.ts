import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/db.js';

let canRunDb = false;
let app: Awaited<ReturnType<typeof buildServer>> | undefined;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
    return;
  }
  app = await buildServer();
  await app.ready();
});

// `describe.skipIf(c)(name, fn)` is the brief's exact form. Note that
// `describe.skipIf(c, n, fn)` (3-arg direct) silently registers an empty
// suite and exits non-zero in vitest 2.0.5.
describe.skipIf(!canRunDb)('safe-fetch integration', () => {
  it('Material POST returns 422 unsafe_url on http://127.0.0.1', async () => {
    const r = await app!.inject({
      method: 'POST',
      url: '/api/projects/p1/materials',
      payload: { type: 'url', title: 'bad', source: 'http://127.0.0.1:1/x' },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error?.code).toBe('unsafe_url');
    expect(JSON.parse(r.body).error?.requestId).toBeTruthy();
  });
});

afterAll(async () => {
  if (app) await app.close();
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});
