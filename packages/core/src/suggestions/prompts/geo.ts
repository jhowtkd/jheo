import type { SuggestionContext } from '../context.js';
import { buildPromptShell } from './shell.js';

export function buildGeoPrompt(ctx: SuggestionContext): string {
  return buildPromptShell({
    persona:
      'You are a senior GEO/AI-readiness consultant. Your recommendations must be safe, evidence-based, and never invent URLs, schema fields, or facts not in the input. Output strict JSON only — no markdown fences, no commentary.',
    focus:
      'Focus: GEO/AI-readiness — llms.txt, robots/sitemaps, structured data (JSON-LD, FAQ schema), citability (sources, author, dates), FAQ blocks.',
    ctx,
    plainLang:
      'Use plain language: short sentences, everyday words, no marketing jargon. The "rationale" field is a one-sentence explanation a non-technical operator can forward to a client.',
    confidence: 'Set "confidence" to "low", "medium", or "high" — same rubric as for SEO prompts.',
  });
}
