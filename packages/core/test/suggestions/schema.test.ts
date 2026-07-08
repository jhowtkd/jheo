import { describe, it, expect } from 'vitest';
import { suggestionOutputSchema, type SuggestionOutput } from '../../src/suggestions/schema.js';

const valid: SuggestionOutput = {
  before: '<title>Old</title>',
  after: '<title>New — concise and keyword-rich</title>',
  confidence: 'medium',
  rationale: 'Adiciona palavras-chave ao título.',
};

describe('suggestionOutputSchema', () => {
  it('accepts a valid payload', () => {
    const r = suggestionOutputSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects unknown extra keys (strict)', () => {
    const r = suggestionOutputSchema.safeParse({ ...valid, extra: 'nope' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid confidence', () => {
    const r = suggestionOutputSchema.safeParse({ ...valid, confidence: 'very-high' });
    expect(r.success).toBe(false);
  });

  it('rejects rationale longer than 280 chars', () => {
    const r = suggestionOutputSchema.safeParse({ ...valid, rationale: 'x'.repeat(281) });
    expect(r.success).toBe(false);
  });

  it('rejects empty before or after', () => {
    expect(suggestionOutputSchema.safeParse({ ...valid, before: '' }).success).toBe(false);
    expect(suggestionOutputSchema.safeParse({ ...valid, after: '' }).success).toBe(false);
  });

  it('accepts all three confidence values', () => {
    for (const c of ['low', 'medium', 'high'] as const) {
      expect(suggestionOutputSchema.safeParse({ ...valid, confidence: c }).success).toBe(true);
    }
  });
});
