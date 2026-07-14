import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenRouterProvider implements LLMProvider {
  constructor(private readonly opts: { apiKey: string; appUrl?: string; appName?: string }) {}

  async complete(req: LLMRequest, fetchFn: typeof fetch): Promise<LLMResponse> {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const body: Record<string, unknown> = { model: req.config.model };
    if (req.config.temperature !== undefined) body.temperature = req.config.temperature;
    if (req.config.maxTokens !== undefined) body.max_tokens = req.config.maxTokens;
    body.messages = req.system
      ? [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ]
      : [{ role: 'user', content: req.prompt }];

    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        'HTTP-Referer': this.opts.appUrl ?? 'https://jheo.local',
        'X-Title': this.opts.appName ?? 'JHEO',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    };
    if (req.signal) init.signal = req.signal;

    const res = await fetchFn(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`openrouter ${res.status}: ${text}`);
    }
    const json = (await res.json()) as OpenRouterResponse;
    return {
      text: json.choices[0]?.message.content ?? '',
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
      provider: 'openrouter',
      model: req.config.model,
    };
  }
}
