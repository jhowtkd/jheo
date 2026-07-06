/**
 * Manual E2E: requires `docker compose up -d` and configured OPENAI_API_KEY.
 * Runs `pnpm --filter @jheo/api exec vitest run test/f3-smoke.test.ts`.
 * Skips automatically when DATABASE_URL is unreachable.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

let canRun = false;
beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRun = true;
  } catch {
    canRun = false;
  }
});

describe('F3 e2e smoke', () => {
  it.runIf(canRun)('writes a Channel and a Publish row through the public schema', async () => {
    const project = await prisma.project.create({
      data: { name: `f3-${Date.now()}`, rootUrl: 'https://example.com' },
    });
    const channel = await prisma.distributionChannel.create({
      data: {
        projectId: project.id,
        type: 'agent',
        name: 'agent-site',
        configEncrypted: 'plain-cleared-by-smoke',
        configSchema: 'agent',
        isActive: true,
      },
    });
    expect(channel.id).toBeDefined();

    // We don't enqueue the publish — the worker requires a real Generation row,
    // which the F2 smoke already creates. This verifies the schema + table exist.
    const tmpl = await prisma.generationTemplate.create({
      data: { name: 'f3-tpl', version: 1, isActive: false, prompt: 'x', outputSchema: {} },
    });
    const gen = await prisma.generation.create({
      data: {
        projectId: project.id,
        templateId: tmpl.id,
        materialIds: [],
        prompt: 'x',
        status: 'queued',
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        sources: [],
        reviewState: 'approved',
      },
    });
    const pub = await prisma.publish.create({
      data: { generationId: gen.id, channelId: channel.id, status: 'queued', attempts: 0 },
    });
    expect(pub.generationId).toBe(gen.id);
    expect(pub.channelId).toBe(channel.id);
  }, { timeout: 60_000 });
});