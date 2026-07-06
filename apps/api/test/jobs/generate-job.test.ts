import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGenerateHandler } from '../../src/jobs/generate-job.js';

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
    expect(
      calls.some((c: any[]) => c[0]?.data?.status === 'completed' && c[0]?.data?.outputMarkdown === sampleParsedOutput),
    ).toBe(true);
  });
});