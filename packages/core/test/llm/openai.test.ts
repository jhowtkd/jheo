import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../src/llm/openai.js';

describe('llm/openai', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('completes a chat request and parses usage', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'hello world' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const r = await new OpenAIProvider({ apiKey: 'k' }).complete(
      { prompt: 'say hi', system: 'sys', config: { model: 'gpt-4o-mini' } },
      globalThis.fetch,
    );
    expect(r.text).toBe('hello world');
    expect(r.usage.promptTokens).toBe(10);
    expect(r.usage.completionTokens).toBe(5);
    expect(r.provider).toBe('openai');
    const called = fetchSpy.mock.calls[0]!;
    const [url, init] = called as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string).messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'say hi' },
    ]);
  });

  it('throws on 4xx with api error message surfaced', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }),
    );
    await expect(
      new OpenAIProvider({ apiKey: 'k' }).complete(
        { prompt: 'x', config: { model: 'gpt-4o-mini' } },
        globalThis.fetch,
      ),
    ).rejects.toThrow(/bad request/);
  });

  it('throws on 5xx', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      new OpenAIProvider({ apiKey: 'k' }).complete(
        { prompt: 'x', config: { model: 'gpt-4o-mini' } },
        globalThis.fetch,
      ),
    ).rejects.toThrow(/500/);
  });

  it('passes AbortSignal through fetch', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 }),
    );
    const ac = new AbortController();
    await new OpenAIProvider({ apiKey: 'k' }).complete(
      { prompt: 'p', config: { model: 'gpt-4o-mini' }, signal: ac.signal },
      globalThis.fetch,
    );
    const called = fetchSpy.mock.calls[0]!;
    const init = called[1] as RequestInit;
    expect(init.signal).toBe(ac.signal);
  });
});