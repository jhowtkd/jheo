import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, runGeneration } from '../src/generation/pipeline.js';

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

describe('buildSystemPrompt (F6 locale)', () => {
  it('emits the plain-language register in Português (Brasil) for pt-BR', () => {
    const out = buildSystemPrompt('pt-BR');
    expect(out).toContain('Português (Brasil)');
    expect(out).toContain('(pt-BR)');
    expect(out).toContain('plain language');
    expect(out).toContain('short sentences');
    expect(out).toContain('everyday words');
    expect(out).toContain('no marketing jargon');
    expect(out).toContain('execute');
    expect(out).toContain('leverage');
    expect(out).toContain('utilize');
  });

  it('emits English for en', () => {
    const out = buildSystemPrompt('en');
    expect(out).toContain('English');
    expect(out).toContain('(en)');
    expect(out).toContain('plain language');
  });

  it('falls back to the bare locale tag for unknown locales', () => {
    const out = buildSystemPrompt('xx');
    expect(out).toContain('(xx)');
    // Should NOT crash and should still contain the register text.
    expect(out).toContain('plain language');
    expect(out).not.toContain('undefined');
  });

  it('falls back to the bare tag for unsupported BCP-47 tags', () => {
    // fr is not in LOCALE_NAMES; the lookup falls back to the bare string.
    expect(buildSystemPrompt('fr')).toContain('(fr)');
    expect(buildSystemPrompt('ja-JP')).toContain('(ja-JP)');
  });

  it('is exported from the barrel', async () => {
    // The barrel re-exports * from pipeline.ts — sanity-check that
    // `@jheo/core` consumers (the api worker, downstream packages) see it.
    const mod = await import('../src/generation/index.js');
    expect(typeof mod.buildSystemPrompt).toBe('function');
  });
});

describe('runGeneration (F6 locale)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('sets req.system containing the plain-language text when ctx.locale is set', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: sampleParsedOutput } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const complete = vi.fn(async () => ({
      text: sampleParsedOutput,
      usage: { promptTokens: 1, completionTokens: 1 },
      provider: 'openai',
      model: 'gpt-4o-mini',
    }));
    const providers = {
      llm: { openai: { complete } },
      embed: { embed: vi.fn() },
    };

    await runGeneration(
      {
        prompt: 'Write about apples',
        template: { prompt: TEMPLATE, outputSchema: {} },
        retrievedMaterials: [],
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        fetchFn: globalThis.fetch,
        locale: 'pt-BR',
      },
      providers as never,
    );

    const req = complete.mock.calls[0]![0] as { prompt: string; system?: string };
    expect(req.system).toBeDefined();
    expect(req.system).toContain('Português (Brasil)');
    expect(req.system).toContain('plain language');
  });

  it('omits req.system when ctx.locale is not provided (backward compat)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: sampleParsedOutput } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const complete = vi.fn(async () => ({
      text: sampleParsedOutput,
      usage: { promptTokens: 1, completionTokens: 1 },
      provider: 'openai',
      model: 'gpt-4o-mini',
    }));
    const providers = {
      llm: { openai: { complete } },
      embed: { embed: vi.fn() },
    };

    await runGeneration(
      {
        prompt: 'Write about apples',
        template: { prompt: TEMPLATE, outputSchema: {} },
        retrievedMaterials: [],
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
        fetchFn: globalThis.fetch,
      },
      providers as never,
    );

    const req = complete.mock.calls[0]![0] as { prompt: string; system?: string };
    expect(req.system).toBeUndefined();
  });
});
