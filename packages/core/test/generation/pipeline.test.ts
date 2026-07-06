import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGeneration } from '../../src/generation/pipeline.js';

const TEMPLATE = `You are a writer.
{{userPrompt}}
{{sources}}
Schema:
{{outputSchemaDescription}}`;

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

describe('generation/pipeline.runGeneration', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('assembles prompt with substitutions and returns parsed output', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: sampleParsedOutput } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
        { status: 200 },
      ),
    );

    const providers = {
      llm: {
        openai: {
          complete: vi.fn(async (_req, _fetch) => ({
            text: sampleParsedOutput,
            usage: { promptTokens: 100, completionTokens: 50 },
            provider: 'openai',
            model: 'gpt-4o-mini',
          })),
        },
      },
      embed: { embed: vi.fn() },
    };

    const r = await runGeneration(
      {
        prompt: 'Write about apples',
        template: { prompt: TEMPLATE, outputSchema: { title: 'string', slug: 'string' } },
        retrievedMaterials: [
          { id: 'm1', title: 'Apple facts', excerpt: 'apples are red', score: 0.95 },
        ],
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        fetchFn: globalThis.fetch,
      },
      providers as never,
    );

    const llmCall = (providers.llm.openai.complete as ReturnType<typeof vi.fn>).mock
      .calls[0] as [{ prompt: string }];
    expect(llmCall[0].prompt).toContain('Write about apples');
    expect(llmCall[0].prompt).toContain('Apple facts');
    expect(llmCall[0].prompt).toContain('Schema:');
    expect(r.parsed.frontMatter.title).toBe('Hello');
    expect(r.parsed.body).toContain('body content');
    expect(r.usage.promptTokens).toBe(100);
  });

  it('retries once with corrective suffix when parse fails', async () => {
    const callArgs: Array<{ prompt: string }> = [];
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: sampleParsedOutput } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const providers = {
      llm: {
        openai: {
          complete: vi.fn(async (req) => {
            callArgs.push(req);
            return {
              text: callArgs.length === 1 ? 'garbage\nnot parseable' : sampleParsedOutput,
              usage: { promptTokens: 1, completionTokens: 1 },
              provider: 'openai',
              model: 'gpt-4o-mini',
            };
          }),
        },
      },
      embed: { embed: vi.fn() },
    };
    const r = await runGeneration(
      {
        prompt: 'p',
        template: { prompt: TEMPLATE, outputSchema: {} },
        retrievedMaterials: [],
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        fetchFn: globalThis.fetch,
      },
      providers as never,
    );
    expect(callArgs.length).toBe(2);
    expect(callArgs[1]!.prompt).toContain('previous response failed schema validation');
    expect(r.parsed.frontMatter.title).toBe('Hello');
  });

  it('throws after second parse failure', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'garbage' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 }),
    );
    const providers = {
      llm: {
        openai: {
          complete: vi.fn(async () => ({
            text: 'still garbage',
            usage: { promptTokens: 1, completionTokens: 1 },
            provider: 'openai',
            model: 'gpt-4o-mini',
          })),
        },
      },
      embed: { embed: vi.fn() },
    };
    await expect(
      runGeneration(
        {
          prompt: 'p',
          template: { prompt: TEMPLATE, outputSchema: {} },
          retrievedMaterials: [],
          llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
          fetchFn: globalThis.fetch,
        },
        providers as never,
      ),
    ).rejects.toThrow(/parse/);
  });
});