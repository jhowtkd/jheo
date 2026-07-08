import type { SuggestionContext } from '../context.js';

const PERSONA =
  'You are a senior accessibility consultant (WCAG 2.1 AA). Output strict JSON only — no markdown fences, no commentary.';

const PLAIN_LANG =
  'Use plain language: short sentences, everyday words, no jargon. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.';

const CONFIDENCE =
  'Set "confidence" to "low", "medium", or "high".';

const LOCALE_NAMES: Record<string, string> = { en: 'English', 'pt-BR': 'Português (Brasil)' };

export function buildA11yPrompt(ctx: SuggestionContext): string {
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
    'Focus: accessibility — alt text, contrast, ARIA, semantic HTML, skip links, lang attribute, form labels.',
    '',
    'Page URL: ' + ctx.pageUrl,
    'Finding: [' + ctx.severity + '] ' + ctx.findingMessage,
    'HTML slice (truncated):',
    '"""',
    ctx.htmlSlice,
    '"""',
  ].join('\n');
}
