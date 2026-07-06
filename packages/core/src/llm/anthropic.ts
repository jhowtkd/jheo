import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

interface AnthropicResponse {
  content: { text: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}
interface AnthropicError {
  error?: { message?: string };
}

export class AnthropicProvider implements LLMProvider {
  constructor(private readonly opts: { apiKey: string; baseUrl?: string }) {}

  async complete(req: LLMRequest, fetchFn: typeof fetch): Promise<LLMResponse> {
    const url = `${this.opts.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`;
    const body: Record<string, unknown> = { model: req.config.model };
    if (req.config.temperature !== undefined) body.temperature = req.config.temperature;
    if (req.config.maxTokens !== undefined) body.max_tokens = req.config.maxTokens;
    if (req.system) body.system = req.system;
    body.messages = [{ role: 'user', content: req.prompt }];

    const init: RequestInit = {
      method: 'POST',
      headers: {
        'x-api-key': this.opts.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    };
    if (req.signal) init.signal = req.signal;

    const res = await fetchFn(url, init);
    if (!res.ok) {
      const text = await res.text();
      const parsed = safeJson(text) as AnthropicError | null;
      const msg = parsed?.error?.message ?? text;
      throw new Error(`anthropic ${res.status}: ${msg}`);
    }
    const json = (await res.json()) as AnthropicResponse;
    return {
      text: json.content[0]?.text ?? '',
      usage: {
        promptTokens: json.usage?.input_tokens ?? 0,
        completionTokens: json.usage?.output_tokens ?? 0,
      },
      provider: 'anthropic',
      model: req.config.model,
    };
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}