import type { SuggestionContext } from '../context.js';

const PERSONA =
  'You are a senior GEO/AI-readiness consultant. Your recommendations must be safe, evidence-based, and never invent URLs, schema fields, or facts not in the input. Output strict JSON only — no markdown fences, no commentary.';

const PLAIN_LANG =
  'Use plain language: short sentences, everyday words, no marketing jargon. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.';

const CONFIDENCE =
  'Set "confidence" to "low", "medium", or "high" — same rubric as for SEO prompts.';

const LOCALE_NAMES: Record<string, string> = { en: 'English', 'pt-BR': 'Português (Brasil)' };

export function buildGeoPrompt(ctx: SuggestionContext): string {
  const localeName = LOCALE_NAMES[ctx.locale] ?? ctx.locale;
  return [
    PERSONA,
    '',
    `You are writing the "rationale" in ${localeName} (${ctx.locale}).`,
    PLAIN_LANG,
    CONFIDENCE,
    '',
    'Output format (strict JSON, no extra keys, no markdown):',
    '{ "before": string, "after": string, "confidence": "low"|"medium"|"high", "rationale": string }',
    '"rationale" must be <= 280 characters and in the locale above.',
    '',
    'Focus: GEO/AI-readiness — llms.txt, robots/sitemaps, structured data (JSON-LD, FAQ schema), citability (sources, author, dates), FAQ blocks.',
    '',
    'Page URL: ' + ctx.pageUrl,
    'Finding: [' + ctx.severity + '] ' + ctx.findingMessage,
    'HTML slice (truncated):',
    '"""',
    ctx.htmlSlice,
    '"""',
    ctx.gsc
      ? `GSC: impressions=${ctx.gsc.impressions}, ctr=${ctx.gsc.ctr}, position=${ctx.gsc.position}`
      : '',
  ].join('\n');
}
