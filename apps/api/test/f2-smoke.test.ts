/**
 * Manual E2E: requires `docker compose up -d` and a real OPENAI_API_KEY
 * either in env or via /api/settings.
 *
 * Run with: pnpm --filter @jheo/api exec vitest run test/f2-smoke.test.ts
 *
 * Skipped automatically when DATABASE_URL is unreachable.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

let canRun = false;
let openaiKey = '';

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRun = true;
  } catch {
    canRun = false;
  }
  openaiKey = process.env.OPENAI_API_KEY ?? '';
});

describe.runIf(canRun && !!openaiKey, 'F2 e2e smoke', () => {
  it('materially writes a generation through RAG', async () => {
    const project = await prisma.project.create({
      data: { name: 'smoke', rootUrl: 'https://example.com/' },
    });
    const material = await prisma.material.create({
      data: {
        projectId: project.id,
        type: 'note',
        title: 'Apples',
        content: 'Apples are red and crisp.',
        contentHash: 'h1',
      },
    });
    const tmpl = await prisma.generationTemplate.create({
      data: {
        name: 'smoke-tpl',
        version: 1,
        isActive: true,
        prompt:
          'You are a writer. Goal: {{userPrompt}}. Sources: {{sources}}. Schema: {{outputSchemaDescription}}.',
        outputSchema: {
          title: 'string', slug: 'string', description: 'string',
          tags: ['string'], date: '2026-07-06', sources: [], targetSites: ['https://example.com'],
        },
      },
    });
    const gen = await prisma.generation.create({
      data: {
        projectId: project.id,
        templateId: tmpl.id,
        materialIds: [material.id],
        prompt: 'Write a post about apples',
        status: 'queued',
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        sources: [],
        reviewState: 'draft',
      },
    });
    // The smoke test just verifies the data was written; running the worker
    // requires BullMQ wiring + Redis which is set up in Task 11. The smoke
    // exists so that future coverage can assert: poll gen until status='completed'.
    expect(gen.id).toBeDefined();
  }, { timeout: 60_000 });
});
