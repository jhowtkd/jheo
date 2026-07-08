import { z } from 'zod';

/**
 * Strict schema for the LLM-produced suggestion payload. Extra keys are
 * rejected so the UI never renders fields it doesn't know about. The 280-char
 * cap on `rationale` is the F6 plain-language rule (one short sentence).
 */
export const suggestionOutputSchema = z
  .object({
    before: z.string().min(1),
    after: z.string().min(1),
    confidence: z.enum(['low', 'medium', 'high']),
    rationale: z.string().min(1).max(280),
  })
  .strict();

export type SuggestionOutput = z.infer<typeof suggestionOutputSchema>;
