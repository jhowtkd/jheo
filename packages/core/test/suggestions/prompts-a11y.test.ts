import { describe, it, expect } from 'vitest';
import { buildA11yPrompt } from '../../src/suggestions/prompts/a11y.js';
import type { SuggestionContext } from '../../src/suggestions/context.js';

const ctx: SuggestionContext = {
  category: 'a11y',
  severity: 'warning',
  findingId: 'f1',
  findingMessage: 'Image missing alt text',
  pageUrl: 'https://example.com/',
  htmlSlice: '<body><img src="/x.png"></body>',
  locale: 'en',
};

describe('buildA11yPrompt', () => {
  it('focuses on accessibility', () => {
    expect(buildA11yPrompt(ctx).toLowerCase()).toContain('accessibility');
  });
});
