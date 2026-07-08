import { describe, it, expect } from 'vitest';
import { buildGeoPrompt } from '../../src/suggestions/prompts/geo.js';
import type { SuggestionContext } from '../../src/suggestions/context.js';

const ctx: SuggestionContext = {
  category: 'geo',
  severity: 'warning',
  findingId: 'f1',
  findingMessage: 'llms.txt is missing',
  pageUrl: 'https://example.com/',
  htmlSlice: '<head></head>',
  locale: 'en',
};

describe('buildGeoPrompt', () => {
  it('focuses on GEO/AI-readiness', () => {
    expect(buildGeoPrompt(ctx).toLowerCase()).toContain('geo');
  });
  it('includes the finding', () => {
    expect(buildGeoPrompt(ctx)).toContain('llms.txt is missing');
  });
});
