import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '../../src/llm/types.js';
import { runSuggestion, LlmOutputError } from '../../src/suggestions/run-suggestion.js';
import type { SuggestionContext } from '../../src/suggestions/context.js';

const ctx: SuggestionContext = {
  category: 'seo',
  severity: 'warning',
  findingId: 'f1',
  findingMessage: 'Meta description is missing',
  pageUrl: 'https://example.com/page',
  htmlSlice: '<head><title>Old</title></head>',
  locale: 'pt-BR',
};

function makeProvider(respond: (prompt: string) => string): LLMProvider {
  return {
    complete: vi.fn(async (req) => ({
      text: respond(req.prompt),
      usage: { promptTokens: 0, completionTokens: 0 },
      provider: 'fake',
      model: 'fake-1',
    })),
  };
}

describe('runSuggestion', () => {
  it('parses a valid LLM JSON output', async () => {
    const out = await runSuggestion(
      makeProvider(() => JSON.stringify({
        before: '<title>Old</title>',
        after: '<title>New</title>',
        confidence: 'high',
        rationale: 'Título mais descritivo.',
      })),
      ctx,
    );
    expect(out.confidence).toBe('high');
    expect(out.after).toBe('<title>New</title>');
  });

  it('throws LlmOutputError on invalid JSON', async () => {
    await expect(
      runSuggestion(makeProvider(() => 'not json at all'), ctx),
    ).rejects.toBeInstanceOf(LlmOutputError);
  });

  it('throws LlmOutputError on JSON missing required keys', async () => {
    await expect(
      runSuggestion(makeProvider(() => JSON.stringify({ after: 'x' })), ctx),
    ).rejects.toBeInstanceOf(LlmOutputError);
  });

  it('throws LlmOutputError on out-of-range confidence', async () => {
    await expect(
      runSuggestion(makeProvider(() => JSON.stringify({
        before: 'a', after: 'b', confidence: 'extreme', rationale: 'r',
      })), ctx),
    ).rejects.toBeInstanceOf(LlmOutputError);
  });

  it('attaches raw text to LlmOutputError', async () => {
    try {
      await runSuggestion(makeProvider(() => 'not json'), ctx);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LlmOutputError);
      expect((e as LlmOutputError).raw).toBe('not json');
    }
  });

  it('rejects overall category with CATEGORY_NOT_SUPPORTED', async () => {
    await expect(
      runSuggestion(makeProvider(() => '{}'), { ...ctx, category: 'overall' }),
    ).rejects.toThrowError('CATEGORY_NOT_SUPPORTED');
  });

  it('selects the right prompt per category (geo)', async () => {
    const provider = makeProvider(() => JSON.stringify({
      before: 'a', after: 'b', confidence: 'low', rationale: 'r',
    }));
    await runSuggestion(provider, { ...ctx, category: 'geo' });
    const called = (provider.complete as any).mock.calls[0][0];
    expect(called.prompt.toLowerCase()).toContain('geo');
  });

  it('parses JSON after a MiniMax-style <think> prefix (even with braces inside)', async () => {
    const payload = {
      before: '<title>Old</title>',
      after: '<title>New</title>',
      confidence: 'medium',
      rationale: 'Melhor título.',
    };
    const raw = `<think>\nI considered { "fake": true } options.\n</think>\n\n${JSON.stringify(payload)}`;
    const out = await runSuggestion(makeProvider(() => raw), ctx);
    expect(out.after).toBe('<title>New</title>');
    expect(out.confidence).toBe('medium');
  });
});
