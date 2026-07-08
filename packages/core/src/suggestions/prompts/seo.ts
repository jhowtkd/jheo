import type { SuggestionContext } from '../context.js';
import { buildPromptShell } from './shell.js';

export function buildSeoPrompt(ctx: SuggestionContext): string {
  return buildPromptShell({
    persona:
      'You are a senior technical SEO consultant. Your recommendations must be safe, evidence-based, and never invent URLs, schema fields, or facts not in the input. Output strict JSON only — no markdown fences, no commentary.',
    focus:
      'Focus: on-page SEO — meta tags (title, description, OG), canonical, robots, headings, alt text, internal links, basic schema.',
    ctx,
    extras: [
      '"after" must be a ready-to-paste replacement (e.g. an entire <title> or <meta> tag, including delimiters).',
    ],
  });
}
