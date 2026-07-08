import { describe, it, expect } from 'vitest';
import { buildCwvPrompt } from '../../src/suggestions/prompts/cwv.js';
import type { SuggestionContext } from '../../src/suggestions/context.js';

const ctx: SuggestionContext = {
  category: 'cwv',
  severity: 'error',
  findingId: 'f1',
  findingMessage: 'LCP image too large',
  pageUrl: 'https://example.com/',
  htmlSlice: '<body><img src="/hero.png"></body>',
  locale: 'en',
};

describe('buildCwvPrompt', () => {
  it('focuses on Core Web Vitals', () => {
    expect(buildCwvPrompt(ctx).toLowerCase()).toContain('core web vitals');
  });
  it('instructs the LLM that "after" can be a textual prescription', () => {
    expect(buildCwvPrompt(ctx)).toContain('one-sentence prescription');
  });
});
