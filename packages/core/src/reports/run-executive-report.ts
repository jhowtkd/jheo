import type { LLMProvider, LLMRequest } from '../llm/types.js';
import type { AuditSummary, ExecutiveNarrative } from './schema.js';
import { ExecutiveNarrativeSchema } from './schema.js';
import { stripLlmThinking } from '../generation/parse.js';
import { buildExecutiveReportPrompt } from './prompts.js';

export class ExecutiveReportLlmError extends Error {
  constructor(
    public readonly raw: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutiveReportLlmError';
  }
}

function tryParseJson(text: string): unknown | undefined {
  // MiniMax-M3 (and similar chat-style models) sometimes emit the JSON
  // payload INSIDE the `<think>…</think>` chain-of-thought block, or
  // wrap it in code fences, or prefix it with reasoning prose. We try
  // a small ladder of cleanups in order, falling through on each
  // failure:
  //   1. Raw — the model already returned clean JSON.
  //   2. After stripLlmThinking + code-fence cleanup — the common case
  //      where the think block precedes the JSON.
  //   3. Scan the ORIGINAL text for the first substring that parses
  //      as JSON, anchored at every `{` we find. Handles the case
  //      where the JSON lives inside the same think block as the
  //      reasoning prose (stripLlmThinking would throw the JSON
  //      away with the think block in that case).
  const candidates: string[] = [
    text,
    stripLlmThinking(text)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim(),
  ];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }

  // Last resort: walk every `{` in the raw text and try to JSON.parse
  // the substring from that `{` up to the matching `}`. We expand the
  // end-of-window by scanning brace depth and respecting string state
  // (with backslash-escape handling) so we don't cut off in the middle
  // of a string or a nested object.
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    const end = findMatchingBrace(text, i);
    if (end < 0) continue;
    const candidate = text.slice(i, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      /* try next `{` */
    }
  }
  return undefined;
}

/**
 * Given the index of a `{` in `text`, return the index of the matching
 * `}` (depth 0), or -1 if the brace is never closed within `text`.
 * Skips `{` / `}` / `"` characters that appear inside a JSON string
 * value, with backslash-escape handling.
 */
function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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
    const prompt =
      attempt === 0
        ? user
        : `${user}\n\nCORRECTION: Your previous output failed schema validation. Output ONLY valid JSON with all required fields.`;
    const req = buildReq(prompt, system);
    const res = await provider.complete(req, fetchFn);
    const parsed = tryParseJson(res.text);
    if (parsed === undefined) {
      throw new ExecutiveReportLlmError(
        res.text,
        `LLM output is not JSON: ${res.text.slice(0, 200)}`,
      );
    }
    const r = ExecutiveNarrativeSchema.safeParse(parsed);
    if (r.success) return r.data;
    if (attempt === 1) {
      throw new ExecutiveReportLlmError(res.text, `LLM output failed schema: ${r.error.message}`);
    }
  }
  throw new Error('UNREACHABLE');
}
