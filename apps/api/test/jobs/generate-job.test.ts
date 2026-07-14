import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGenerateHandler } from '../../src/jobs/generate-job.js';
import { loadMaterialsForGeneration } from '../../src/jobs/generate-job.js';
import { prisma } from '../../src/db.js';
import { parseMarkdownWithFrontmatter } from '@jheo/core';

const sampleParsedOutput = `---
title: Hello
slug: hello
description: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tags: [seo]
date: 2026-07-06
sources: []
targetSites: [https://example.com]
---

body content goes here. body content goes here. body content goes here.`;

describe('jobs/generate-job', () => {
  const fakePrisma: any = {
    generation: { findUnique: vi.fn(), update: vi.fn() },
    project: { findUnique: vi.fn() },
    generationTemplate: { findUnique: vi.fn() },
    material: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  };
  const fakeFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs the pipeline end-to-end against mocked fetch and prisma', async () => {
    fakePrisma.generation.findUnique.mockResolvedValue({
      id: 'gen1',
      projectId: 'p1',
      templateId: 't1',
      materialIds: ['m1'],
      prompt: 'Write about apples',
      llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
      status: 'queued',
      reviewState: 'draft',
    });
    fakePrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: 'p', rootUrl: 'https://x' });
    fakePrisma.generationTemplate.findUnique.mockResolvedValue({
      id: 't1',
      name: 'tpl',
      version: 1,
      isActive: true,
      prompt: '{{userPrompt}}',
      outputSchema: {},
      createdAt: new Date(),
    });
    fakePrisma.material.findMany.mockResolvedValue([
      {
        id: 'm1', type: 'note', title: 'Apple facts',
        content: 'apples are red', contentHash: 'h', embedding: null,
        metadata: {}, projectId: 'p1', createdAt: new Date(),
      },
    ]);
    fakePrisma.$queryRaw.mockResolvedValue([{ id: 'm1', title: 'Apple facts', content: 'apples are red', score: 0.95 }]);
    fakePrisma.$queryRawUnsafe.mockResolvedValue([{ id: 'm1', title: 'Apple facts', content: 'apples are red', score: 0.95 }]);
    fakePrisma.$executeRaw.mockResolvedValue(undefined);
    fakePrisma.$executeRawUnsafe.mockResolvedValue(undefined);
    fakePrisma.generation.update.mockResolvedValue({});
    fakeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: sampleParsedOutput } }],
          usage: { prompt_tokens: 50, completion_tokens: 30 },
        }),
        { status: 200 },
      ),
    );

    const embed = {
      embed: vi
        .fn()
        .mockResolvedValueOnce({ embeddings: [[1, 2, 3]], model: 'text-embedding-3-small' }) // for missing material
        .mockResolvedValueOnce({ embeddings: [[4, 5, 6]], model: 'text-embedding-3-small' }), // for user prompt
    };
    const llm = {
      openai: {
        complete: vi.fn().mockResolvedValue({
          text: sampleParsedOutput,
          usage: { promptTokens: 50, completionTokens: 30 },
          provider: 'openai',
          model: 'gpt-4o-mini',
        }),
      },
    };

    const handler = makeGenerateHandler({
      prisma: fakePrisma,
      fetchFn: fakeFetch as unknown as typeof fetch,
      embedProvider: embed as never,
      llmProviders: llm as never,
    });
    await handler({ data: { generationId: 'gen1' } } as never);

    // Status should have transitioned: queued -> running -> completed.
    expect(fakePrisma.generation.update).toHaveBeenCalled();
    const calls = fakePrisma.generation.update.mock.calls;
    expect(calls.some((c: any[]) => c[0]?.data?.status === 'running')).toBe(true);

    // The completed update persists outputMarkdown produced by the core
    // pipeline's serializeMarkdown(), which round-trips the model's text
    // through parseMarkdownWithFrontmatter to strip think blocks. The
    // resulting string is not byte-equal to the raw LLM response (YAML
    // quoting / whitespace can change), so assert semantically: parse the
    // persisted output back and confirm the frontmatter + body survived.
    const completedCall = calls.find(
      (c: any[]) => c[0]?.data?.status === 'completed' && typeof c[0]?.data?.outputMarkdown === 'string',
    );
    expect(completedCall).toBeDefined();
    const persisted = completedCall![0].data.outputMarkdown as string;
    const expectedParsed = parseMarkdownWithFrontmatter(sampleParsedOutput);
    const actualParsed = parseMarkdownWithFrontmatter(persisted);
    expect(actualParsed.ok).toBe(true);
    expect(actualParsed.parsed).not.toBeNull();
    // Frontmatter fields round-trip exactly for the sample we send in.
    expect(actualParsed.parsed!.frontMatter).toEqual(expectedParsed.parsed!.frontMatter);
    // Body is what the LLM produced.
    expect(actualParsed.parsed!.body.trim()).toBe(expectedParsed.parsed!.body.trim());
  });
});

// DB-gated integration test: a helper used to load materials for a generation
// must filter by `projectId` so that workers serving project A can never
// surface project B's content (H-03 — cross-project isolation).
let canRunDb = false;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});

describe.skipIf(!canRunDb)('generate-job cross-project material scope', () => {
  it('only loads materials belonging to the generation project (H-03)', async () => {
    const stamp = Date.now();
    const projectA = await prisma.project.create({
      data: { name: `h03-A-${stamp}`, rootUrl: 'https://example-a.test' },
    });
    const projectB = await prisma.project.create({
      data: { name: `h03-B-${stamp}`, rootUrl: 'https://example-b.test' },
    });
    const matA = await prisma.material.create({
      data: {
        projectId: projectA.id,
        type: 'url',
        title: 'A',
        content: 'A content',
        contentHash: `h03-a-${stamp}`,
      },
    });
    const matB = await prisma.material.create({
      data: {
        projectId: projectB.id,
        type: 'url',
        title: 'B',
        content: 'B content',
        contentHash: `h03-b-${stamp}`,
      },
    });
    const gen = await prisma.generation.create({
      data: {
        projectId: projectA.id,
        templateId: (await prisma.generationTemplate.findFirstOrThrow({ select: { id: true } })).id,
        materialIds: [],
        prompt: 'g',
        status: 'completed',
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        sources: [],
        reviewState: 'draft',
      },
    });
    const loaded = await loadMaterialsForGeneration(prisma, gen.id);
    expect(loaded.map((m) => m.id)).toEqual([matA.id]);
    // cleanup
    await prisma.material.deleteMany({ where: { id: { in: [matA.id, matB.id] } } });
    await prisma.generation.delete({ where: { id: gen.id } });
    await prisma.project.deleteMany({ where: { id: { in: [projectA.id, projectB.id] } } });
  });
});