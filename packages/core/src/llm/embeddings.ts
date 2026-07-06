import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResponse } from './types.js';

interface EmbeddingsApiResponse {
  data: { embedding: number[] }[];
  model: string;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly opts: { apiKey: string; model?: string; baseUrl?: string }) {}

  async embed(req: EmbeddingRequest, fetchFn: typeof fetch): Promise<EmbeddingResponse> {
    const model = req.model ?? this.opts.model ?? 'text-embedding-3-small';
    const url = `${this.opts.baseUrl ?? 'https://api.openai.com'}/v1/embeddings`;

    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ input: req.inputs, model }),
    };
    if (req.signal) init.signal = req.signal;

    const res = await fetchFn(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`embeddings ${res.status}: ${text}`);
    }
    const json = (await res.json()) as EmbeddingsApiResponse;
    return { embeddings: json.data.map((d) => d.embedding), model: json.model ?? model };
  }
}