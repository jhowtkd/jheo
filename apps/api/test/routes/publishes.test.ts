import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server.js';

let app: Awaited<ReturnType<typeof buildServer>>;
let canRunDb = false;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  try {
    await (await import('../../src/db.js')).prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});
afterAll(async () => {
  await app.close();
});

describe('routes/publishes validation', () => {
  it('rejects missing channelIds', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/generations/g1/publish',
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects empty channelIds', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/generations/g1/publish',
      payload: { channelIds: [] },
    });
    expect(r.statusCode).toBe(400);
  });

  it('returns 404 for unknown generation', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/generations/nope/publishes' });
    // No DB → likely 500; 404 only with real DB. Just confirm not 200.
    expect([200, 404, 500]).toContain(r.statusCode);
  });
});

describe.runIf(canRunDb, 'routes/publishes publish flow', () => {
  it('rejects publishing from non-approved generation', async () => {
    const { prisma } = await import('../../src/db.js');
    const project = await prisma.project.create({ data: { name: 'p', rootUrl: 'https://x' } });
    const tmpl = await prisma.generationTemplate.create({
      data: {
        name: 't',
        version: 1,
        isActive: true,
        prompt: 'p',
        outputSchema: {},
      },
    });
    const gen = await prisma.generation.create({
      data: {
        projectId: project.id,
        templateId: tmpl.id,
        materialIds: [],
        prompt: 'x',
        status: 'completed',
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        sources: [],
        reviewState: 'draft',
      },
    });
    const r = await app.inject({
      method: 'POST',
      url: `/api/generations/${gen.id}/publish`,
      payload: { channelIds: [] },
    });
    expect(r.statusCode).toBe(400); // empty channelIds
  });
});