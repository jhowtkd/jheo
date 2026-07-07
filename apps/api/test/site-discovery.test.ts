import { describe, expect, it, vi } from 'vitest';
import { discoverSite } from '../src/site-discovery.js';

const response = (text: string, status = 200) => ({ status, headers: {}, text });

describe('discoverSite', () => {
  it('reads sitemap indexes and keeps only same-origin pages', async () => {
    const fetchText = vi.fn(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) {
        return response('<sitemapindex><sitemap><loc>https://example.com/posts.xml</loc></sitemap></sitemapindex>');
      }
      return response('<urlset><url><loc>https://example.com/a</loc></url><url><loc>https://other.test/b</loc></url></urlset>');
    });

    await expect(discoverSite('https://example.com/', fetchText)).resolves.toEqual([
      { url: 'https://example.com/', discoveredVia: 'root' },
      { url: 'https://example.com/a', discoveredVia: 'sitemap' },
    ]);
  });

  it('crawls internal links when no sitemap exists', async () => {
    const fetchText = vi.fn(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) return response('', 404);
      if (url.endsWith('/')) return response('<a href="/a">A</a><a href="https://other.test/x">X</a>');
      return response('<a href="/b#section">B</a>');
    });

    const pages = await discoverSite('https://example.com/', fetchText);
    expect(pages.map((page) => page.url)).toEqual([
      'https://example.com/',
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });
});
