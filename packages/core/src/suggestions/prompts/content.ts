import type { SuggestionContext } from '../context.js';

const PERSONA =
  'You are a senior content strategist and plain-language editor. You rewrite copy for clarity. Output strict JSON only — no markdown fences, no commentary.';

const PLAIN_LANG =
  'Use plain language: short sentences, everyday words, no marketing jargon, no enterprise-speak. The rewritten "after" text must be readable by someone with limited formal education.';

const CONFIDENCE =
  'Set "confidence" to "low", "medium", or "high".';

const LOCALE_NAMES: Record<string, string> = { en: 'English', 'pt-BR': 'Português (Brasil)' };

export function buildContentPrompt(ctx: SuggestionContext): string {
  const localeName = LOCALE_NAMES[ctx.locale] ?? ctx.locale;
  return [
    PERSONA,
    '',
    `You are writing the "after" copy AND the "rationale" in ${localeName} (${ctx.locale}).`,
    PLAIN_LANG,
    CONFIDENCE,
    '',
    'Output format (strict JSON, no extra keys, no markdown):',
    '{ "before": string, "after": string, "confidence": "low"|"medium"|"high", "rationale": string }',
    '"rationale" must be <= 280 characters and in the locale above.',
    '"after" should preserve the original meaning but improve clarity. Match the original length within ±20%.',
    '',
    'Focus: content quality — thin content, readability, dates freshness, language consistency, paragraph structure.',
    '',
    'Page URL: ' + ctx.pageUrl,
    'Finding: [' + ctx.severity + '] ' + ctx.findingMessage,
    'HTML slice (truncated):',
    '"""',
    ctx.htmlSlice,
    '"""',
  ].join('\n');
}
