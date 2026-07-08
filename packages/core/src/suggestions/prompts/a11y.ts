import type { SuggestionContext } from '../context.js';
import { buildPromptShell } from './shell.js';

export function buildA11yPrompt(ctx: SuggestionContext): string {
  return buildPromptShell({
    persona:
      'You are a senior accessibility consultant (WCAG 2.1 AA). Output strict JSON only — no markdown fences, no commentary.',
    focus:
      'Focus: accessibility — alt text, contrast, ARIA, semantic HTML, skip links, lang attribute, form labels.',
    ctx,
    plainLang:
      'Use plain language: short sentences, everyday words, no jargon. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.',
    confidence: 'Set "confidence" to "low", "medium", or "high".',
    includeGsc: false,
  });
}
