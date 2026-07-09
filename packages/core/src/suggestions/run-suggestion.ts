import type { LLMProvider, LLMRequest } from '../llm/types.js';
import type { SuggestionContext, SuggestionCategory } from './context.js';
import { suggestionOutputSchema, type SuggestionOutput } from './schema.js';
import { buildSeoPrompt } from './prompts/seo.js';
import { buildGeoPrompt } from './prompts/geo.js';
import { buildCwvPrompt } from './prompts/cwv.js';
import { buildA11yPrompt } from './prompts/a11y.js';
import { buildContentPrompt } from './prompts/content.js';
import { buildOverallPrompt } from './prompts/overall.js';

export class LlmOutputError extends Error {
  constructor(public readonly raw: string, message: string) {
    super(message);
    this.name = 'LlmOutputError';
  }
}

function selectPrompt(ctx: SuggestionContext): string {
  switch (ctx.category as SuggestionCategory) {
    case 'seo': return buildSeoPrompt(ctx);
    case 'geo': return buildGeoPrompt(ctx);
    case 'cwv': return buildCwvPrompt(ctx);
    case 'a11y': return buildA11yPrompt(ctx);
    case 'content': return buildContentPrompt(ctx);
    case 'overall': throw new Error('CATEGORY_NOT_SUPPORTED');
  }
}

function tryParseJson(text: string): unknown | undefined {
  // Strip optional ```json fences the LLM sometimes adds despite instructions.
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)); } catch { /* fall through */ }
  }
  return undefined;
}

export async function runSuggestion(
  provider: LLMProvider,
  ctx: SuggestionContext,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<SuggestionOutput> {
  if (ctx.category === 'overall') throw new Error('CATEGORY_NOT_SUPPORTED');
  // Reference the unreachable stub so the dispatch table is exhaustive at
  // the type level (TS would otherwise complain on a `default:`).
  void buildOverallPrompt;

  const prompt = selectPrompt(ctx);
  // `LLMProvider` doesn't carry its own model name — the model is a config
  // choice the caller (api layer) supplies. The api layer threads the real
  // model name into the persisted `Suggestion.model` field after the call
  // returns. Here we send a default that the provider may ignore; OpenAI
  // (and MiniMax-compatible) use `req.config.model` as the deployment name.
  // Allow override via env so MiniMax deployments can supply e.g.
  // `JHEO_SUGGESTION_MODEL=MiniMax-M3` without changing source.
  const req: LLMRequest = {
    prompt,
    config: { model: process.env.JHEO_SUGGESTION_MODEL ?? 'gpt-4o-mini' },
    signal: AbortSignal.timeout(30_000),
  };
  const res = await provider.complete(req, fetchFn);
  const parsed = tryParseJson(res.text);
  if (parsed === undefined) {
    throw new LlmOutputError(res.text, `LLM output is not JSON: ${res.text.slice(0, 200)}`);
  }
  const r = suggestionOutputSchema.safeParse(parsed);
  if (!r.success) {
    throw new LlmOutputError(res.text, `LLM output failed schema: ${r.error.message}`);
  }
  return r.data;
}
