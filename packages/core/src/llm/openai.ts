import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';
import { safeJson } from './http.js';

interface OpenAIChatResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface OpenAIError {
  error?: { message?: string };
}

export class OpenAIProvider implements LLMProvider {
  constructor(private readonly opts: { apiKey: string; baseUrl?: string }) {}

  async complete(req: LLMRequest, fetchFn: typeof fetch): Promise<LLMResponse> {
    const url = `${this.opts.baseUrl ?? 'https://api.openai.com'}/v1/chat/completions`;
    const body: Record<string, unknown> = { model: req.config.model };
    if (req.config.temperature !== undefined) body.temperature = req.config.temperature;
    if (req.config.maxTokens !== undefined) body.max_tokens = req.config.maxTokens;
    body.messages = req.system
      ? [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }]
      : [{ role: 'user', content: req.prompt }];

    const init: RequestInit = {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    };
    if (req.signal) init.signal = req.signal;

    const res = await fetchFn(url, init);
    if (!res.ok) {
      const text = await res.text();
      const parsed = safeJson(text) as OpenAIError | null;
      const msg = parsed?.error?.message ?? text;
      throw new Error(`openai ${res.status}: ${msg}`);
    }
    const json = (await res.json()) as OpenAIChatResponse;
    const text = json.choices[0]?.message.content ?? '';
    return {
      text,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
      provider: 'openai',
      model: req.config.model,
    };
  }
}