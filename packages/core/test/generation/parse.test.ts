import { describe, expect, it } from 'vitest';
import { parseMarkdownWithFrontmatter } from '../../src/generation/parse.js';

describe('generation/parse', () => {
  it('parses YAML frontmatter and markdown body', () => {
    const raw = `---
title: Hello
slug: hello
description: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tags: [seo]
date: 2026-07-06
sources: []
targetSites: [https://example.com]
---

# Heading

Body paragraph here that meets the minimum length requirement.`;
    const r = parseMarkdownWithFrontmatter(raw);
    expect(r.ok).toBe(true);
    expect(r.parsed?.frontMatter.title).toBe('Hello');
    expect(r.parsed?.body).toContain('# Heading');
  });

  it('rejects bodies shorter than 50 chars with schema-violation', () => {
    const raw = `---
title: Hello
slug: hello
description: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tags: [seo]
date: 2026-07-06
sources: []
targetSites: [https://example.com]
---

too short`;
    const r = parseMarkdownWithFrontmatter(raw);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('schema-violation');
  });

  it('rejects missing frontmatter', () => {
    const r = parseMarkdownWithFrontmatter('# Just a heading\n\nBody.');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no-frontmatter');
  });

  it('rejects malformed YAML', () => {
    const r = parseMarkdownWithFrontmatter(`---
title: : not yaml
---
body`);
    expect(r.ok).toBe(false);
  });
});