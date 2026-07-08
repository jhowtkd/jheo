import type { SuggestionContext } from '../context.js';
import { buildPromptShell } from './shell.js';

export function buildCwvPrompt(ctx: SuggestionContext): string {
  return buildPromptShell({
    persona:
      'You are a senior web performance consultant. Output strict JSON only — no markdown fences, no commentary.',
    focus:
      'Focus: Core Web Vitals — image compression, script deferral, font preloading, cache headers. NOTE: CWV fixes are often textual guidance, not HTML patches. When the optimal "after" is not a code snippet, set "after" to a one-sentence prescription like "Compress /assets/hero.png from 240KB to < 100KB and serve as WebP."',
    ctx,
    plainLang:
      'Use plain language: short sentences, everyday words, no marketing jargon. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.',
    confidence:
      'Set "confidence" to "low", "medium", or "high" — "low" if you are inferring from a generic message, "high" if the asset is clearly identified.',
    includeGsc: false,
  });
}
