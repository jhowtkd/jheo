import type { LLMProvider, LLMRequest } from '../llm/types.js';
import type { AuditSummary, ExecutiveNarrative } from './schema.js';
import { ExecutiveNarrativeSchema } from './schema.js';
import { stripLlmThinking } from '../generation/parse.js';
import { buildExecutiveReportPrompt } from './prompts.js';

export class ExecutiveReportLlmError extends Error {
  constructor(public readonly raw: string, message: string) {
    super(message);
    this.name = 'ExecutiveReportLlmError';
  }
}

function tryParseJson(text: string): unknown | undefined {
  const stripped = stripLlmThinking(text)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)); } catch { /* fall through */ }
  }
  return undefined;
}

function buildReq(prompt: string, system: string): LLMRequest {
  const model = process.env.JHEO_REPORT_MODEL ?? process.env.JHEO_SUGGESTION_MODEL ?? 'gpt-4o-mini';
  return { prompt, system, config: { model }, signal: AbortSignal.timeout(60_000) };
}

export async function runExecutiveReport(
  provider: LLMProvider,
  summary: AuditSummary,
  locale: 'en' | 'pt-BR',
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<ExecutiveNarrative> {
  const { system, user } = buildExecutiveReportPrompt(summary, locale);

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0
      ? user
      : `${user}\n\nCORRECTION: Your previous output failed schema validation. Output ONLY valid JSON with all required fields.`;
    const req = buildReq(prompt, system);
    const res = await provider.complete(req, fetchFn);
    const parsed = tryParseJson(res.text);
    if (parsed === undefined) {
      throw new ExecutiveReportLlmError(res.text, `LLM output is not JSON: ${res.text.slice(0, 200)}`);
    }
    const r = ExecutiveNarrativeSchema.safeParse(parsed);
    if (r.success) return r.data;
    if (attempt === 1) {
      throw new ExecutiveReportLlmError(res.text, `LLM output failed schema: ${r.error.message}`);
    }
  }
  throw new Error('UNREACHABLE');
}
