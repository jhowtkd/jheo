import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';

let app: Awaited<ReturnType<typeof buildServer>>;
let canRunDb = false;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});
afterAll(async () => {
  await app.close();
});

describe('routes/templates validation', () => {
  it('rejects missing prompt', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/templates', payload: { name: 't' } });
    expect(r.statusCode).toBe(400);
  });
});

describe.runIf(canRunDb, 'routes/templates versioning', () => {
  it('creates v1 then PUT creates v2 with same name, preserving both', async () => {
    const v1 = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: {
        name: `tpl-${Date.now()}`,
        prompt: 'v1',
        outputSchema: { title: 'string' },
      },
    });
    expect(v1.statusCode).toBe(200);
    const v1row = v1.json();

    const v2 = await app.inject({
      method: 'PUT',
      url: `/api/templates/${v1row.id}`,
      payload: { prompt: 'v2', outputSchema: { title: 'string' } },
    });
    expect(v2.statusCode).toBe(200);
    const v2row = v2.json();
    expect(v2row.version).toBe(2);

    // Activate v2; v1 must deactivate.
    const act = await app.inject({
      method: 'PATCH',
      url: `/api/templates/${v2row.id}/active`,
      payload: {},
    });
    expect(act.statusCode).toBe(200);
    const after = await prisma.generationTemplate.findUnique({ where: { id: v1row.id } });
    const after2 = await prisma.generationTemplate.findUnique({ where: { id: v2row.id } });
    expect(after?.isActive).toBe(false);
    expect(after2?.isActive).toBe(true);
  });
});
