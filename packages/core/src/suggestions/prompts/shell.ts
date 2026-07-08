import type { SuggestionContext } from '../context.js';
import { localeDisplayName } from '../../i18n/locale.js';

const DEFAULT_PLAIN_LANG =
  'Use plain language: short sentences, everyday words, no marketing jargon, no enterprise-speak. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.';

const DEFAULT_CONFIDENCE =
  'Set "confidence" to "low" (evidence is thin, guessing), "medium" (standard fix, inputs support it), or "high" (unambiguous, mechanical fix).';

const OUTPUT_FORMAT = [
  'Output format (strict JSON, no extra keys, no markdown):',
  '{ "before": string, "after": string, "confidence": "low"|"medium"|"high", "rationale": string }',
  '"rationale" must be <= 280 characters and in the locale above.',
].join('\n');

export type PromptShellOpts = {
  persona: string;
  focus: string;
  ctx: SuggestionContext;
  /** Override default plain-language instruction. */
  plainLang?: string;
  /** Override default confidence rubric. */
  confidence?: string;
  /** Extra lines after the focus block (e.g. after-field guidance). */
  extras?: string[];
  /** Locale line template; default writes rationale in the locale. */
  localeLine?: (localeName: string, locale: string) => string;
  /** Include GSC metrics line when present (default true). */
  includeGsc?: boolean;
};

/**
 * Shared scaffolding for category suggestion prompts — persona, locale,
 * JSON schema, page/finding/html slice. Category files only supply focus.
 */
export function buildPromptShell(opts: PromptShellOpts): string {
  const localeName = localeDisplayName(opts.ctx.locale);
  const localeLine =
    opts.localeLine?.(localeName, opts.ctx.locale) ??
    `You are writing the "rationale" in ${localeName} (${opts.ctx.locale}).`;
  const includeGsc = opts.includeGsc !== false;
  const lines = [
    opts.persona,
    '',
    localeLine,
    opts.plainLang ?? DEFAULT_PLAIN_LANG,
    opts.confidence ?? DEFAULT_CONFIDENCE,
    '',
    OUTPUT_FORMAT,
    ...(opts.extras ?? []),
    '',
    opts.focus,
    '',
    'Page URL: ' + opts.ctx.pageUrl,
    'Finding: [' + opts.ctx.severity + '] ' + opts.ctx.findingMessage,
    'HTML slice (truncated):',
    '"""',
    opts.ctx.htmlSlice,
    '"""',
  ];
  if (includeGsc && opts.ctx.gsc) {
    lines.push(
      `GSC: impressions=${opts.ctx.gsc.impressions}, ctr=${opts.ctx.gsc.ctr}, position=${opts.ctx.gsc.position}`,
    );
  }
  return lines.join('\n');
}
