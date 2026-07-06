import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/llm/openrouter.js';

describe('llm/openrouter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('uses OpenAI-compatible shape and adds HTTP-Referer header', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'x' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const r = await new OpenRouterProvider({ apiKey: 'k' }).complete(
      { prompt: 'p', config: { model: 'anthropic/claude-3-5-sonnet' } },
      globalThis.fetch,
    );
    expect(r.text).toBe('x');
    expect(r.provider).toBe('openrouter');
    const called = fetchSpy.mock.calls[0]!;
    const [url, init] = called as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
    expect(headers['HTTP-Referer']).toBe('https://jheo.local');
  });
});