import { describe, it, expect } from 'vitest';
import { buildContentPrompt } from '../../src/suggestions/prompts/content.js';
import type { SuggestionContext } from '../../src/suggestions/context.js';

const ctx: SuggestionContext = {
  category: 'content',
  severity: 'info',
  findingId: 'f1',
  findingMessage: 'Paragraph too long',
  pageUrl: 'https://example.com/',
  htmlSlice: '<body><p>long</p></body>',
  locale: 'en',
};

describe('buildContentPrompt', () => {
  it('focuses on content quality', () => {
    expect(buildContentPrompt(ctx).toLowerCase()).toContain('content');
  });
});
