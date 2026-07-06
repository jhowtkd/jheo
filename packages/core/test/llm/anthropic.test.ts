import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../src/llm/anthropic.js';

describe('llm/anthropic', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('completes and parses usage', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ text: 'hello' }],
          usage: { input_tokens: 7, output_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    const r = await new AnthropicProvider({ apiKey: 'k' }).complete(
      { prompt: 'hi', system: 'sys', config: { model: 'claude-3-5-haiku-20241022' } },
      globalThis.fetch,
    );
    expect(r.text).toBe('hello');
    expect(r.usage.promptTokens).toBe(7);
    expect(r.usage.completionTokens).toBe(3);
    expect(r.provider).toBe('anthropic');
    const called = fetchSpy.mock.calls[0]!;
    const [url, init] = called as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('k');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('throws on error', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'no money' } }), { status: 402 }),
    );
    await expect(
      new AnthropicProvider({ apiKey: 'k' }).complete(
        { prompt: 'x', config: { model: 'claude-3-5-haiku-20241022' } },
        globalThis.fetch,
      ),
    ).rejects.toThrow(/no money/);
  });
});