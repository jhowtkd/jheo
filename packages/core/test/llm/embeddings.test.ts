import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from '../../src/llm/embeddings.js';

describe('llm/embeddings (OpenAI text-embedding-3-small)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('embeds a batch of inputs and parses 1536-d vectors', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { embedding: Array.from({ length: 1536 }, (_, i) => i * 0.001) },
            { embedding: Array.from({ length: 1536 }, (_, i) => i * 0.002) },
          ],
        }),
        { status: 200 },
      ),
    );
    const r = await new OpenAIEmbeddingProvider({ apiKey: 'k' }).embed(
      { inputs: ['a', 'b'] },
      globalThis.fetch,
    );
    expect(r.embeddings).toHaveLength(2);
    expect(r.embeddings[0]).toHaveLength(1536);
    expect(r.model).toBe('text-embedding-3-small');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).model).toBe('text-embedding-3-small');
  });

  it('uses batching endpoint URL', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: new Array(1536).fill(0) }] }), { status: 200 }),
    );
    await new OpenAIEmbeddingProvider({ apiKey: 'k' }).embed(
      { inputs: ['x'] },
      globalThis.fetch,
    );
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toBe('https://api.openai.com/v1/embeddings');
  });
});