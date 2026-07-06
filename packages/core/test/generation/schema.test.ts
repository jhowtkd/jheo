import { describe, expect, it } from 'vitest';
import { FrontMatterSchema, ParsedMarkdownSchema } from '../../src/generation/schema.js';

describe('generation/schema', () => {
  it('accepts a valid frontmatter', () => {
    const r = FrontMatterSchema.safeParse({
      title: 'Hello world',
      slug: 'hello-world',
      description: 'a'.repeat(60),
      tags: ['seo'],
      date: '2026-07-06',
      sources: [],
      targetSites: ['https://example.com'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad slug', () => {
    const r = FrontMatterSchema.safeParse({
      title: 'Hello world',
      slug: 'Hello World!',
      description: 'a'.repeat(60),
      tags: ['seo'],
      date: '2026-07-06',
      sources: [],
      targetSites: ['https://example.com'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects short description', () => {
    const r = FrontMatterSchema.safeParse({
      title: 'Hello world',
      slug: 'hello-world',
      description: 'short',
      tags: ['seo'],
      date: '2026-07-06',
      sources: [],
      targetSites: ['https://example.com'],
    });
    expect(r.success).toBe(false);
  });

  it('ParsedMarkdown requires body of >= 50 chars', () => {
    const r = ParsedMarkdownSchema.safeParse({
      frontMatter: {
        title: 'Hello world',
        slug: 'hello-world',
        description: 'a'.repeat(60),
        tags: ['seo'],
        date: '2026-07-06',
        sources: [],
        targetSites: ['https://example.com'],
      },
      body: 'short',
    });
    expect(r.success).toBe(false);
  });
});