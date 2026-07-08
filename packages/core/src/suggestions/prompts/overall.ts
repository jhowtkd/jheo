import type { SuggestionContext } from '../context.js';

// `overall` is reserved for F8 global-suggestions panel. F7 never reaches
// here because `buildSuggestionContext` rejects the category at the gate
// (CATEGORY_NOT_SUPPORTED). This stub keeps the prompt map exhaustive so
// `runSuggestion` can dispatch by category without a `default:` branch.
export function buildOverallPrompt(_ctx: SuggestionContext): string {
  throw new Error('OVERALL_PROMPT_UNREACHABLE');
}
