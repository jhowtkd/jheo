import type { SuggestionContext } from '../context.js';

const PERSONA =
  'You are a senior web performance consultant. Output strict JSON only — no markdown fences, no commentary.';

const PLAIN_LANG =
  'Use plain language: short sentences, everyday words, no marketing jargon. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.';

const CONFIDENCE =
  'Set "confidence" to "low", "medium", or "high" — "low" if you are inferring from a generic message, "high" if the asset is clearly identified.';

const LOCALE_NAMES: Record<string, string> = { en: 'English', 'pt-BR': 'Português (Brasil)' };

export function buildCwvPrompt(ctx: SuggestionContext): string {
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
    'Focus: Core Web Vitals — image compression, script deferral, font preloading, cache headers. NOTE: CWV fixes are often textual guidance, not HTML patches. When the optimal "after" is not a code snippet, set "after" to a one-sentence prescription like "Compress /assets/hero.png from 240KB to < 100KB and serve as WebP."',
    '',
    'Page URL: ' + ctx.pageUrl,
    'Finding: [' + ctx.severity + '] ' + ctx.findingMessage,
    'HTML slice (truncated):',
    '"""',
    ctx.htmlSlice,
    '"""',
  ].join('\n');
}
