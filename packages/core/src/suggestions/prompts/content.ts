import type { SuggestionContext } from '../context.js';
import { buildPromptShell } from './shell.js';

export function buildContentPrompt(ctx: SuggestionContext): string {
  return buildPromptShell({
    persona:
      'You are a senior content strategist and plain-language editor. You rewrite copy for clarity. Output strict JSON only — no markdown fences, no commentary.',
    focus:
      'Focus: content quality — thin content, readability, dates freshness, language consistency, paragraph structure.',
    ctx,
    plainLang:
      'Use plain language: short sentences, everyday words, no marketing jargon, no enterprise-speak. The rewritten "after" text must be readable by someone with limited formal education.',
    confidence: 'Set "confidence" to "low", "medium", or "high".',
    localeLine: (localeName, locale) =>
      `You are writing the "after" copy AND the "rationale" in ${localeName} (${locale}).`,
    extras: [
      '"after" should preserve the original meaning but improve clarity. Match the original length within ±20%.',
    ],
    includeGsc: false,
  });
}
