import { describe, it, expect } from 'vitest';
import { buildSeoPrompt } from '../../src/suggestions/prompts/seo.js';
import type { SuggestionContext } from '../../src/suggestions/context.js';

const ctx: SuggestionContext = {
  category: 'seo',
  severity: 'warning',
  findingId: 'f1',
  findingMessage: 'Meta description is missing',
  pageUrl: 'https://example.com/page',
  htmlSlice: '<head><title>Old</title></head>',
  locale: 'pt-BR',
};

describe('buildSeoPrompt', () => {
  it('includes the finding message', () => {
    expect(buildSeoPrompt(ctx)).toContain('Meta description is missing');
  });
  it('enforces pt-BR locale', () => {
    expect(buildSeoPrompt(ctx)).toContain('pt-BR');
  });
  it('demands strict JSON output with the four required fields', () => {
    const p = buildSeoPrompt(ctx);
    expect(p).toContain('"before"');
    expect(p).toContain('"after"');
    expect(p).toContain('"confidence"');
    expect(p).toContain('"rationale"');
  });
  it('enforces plain-language register', () => {
    expect(buildSeoPrompt(ctx).toLowerCase()).toContain('plain language');
  });
});
