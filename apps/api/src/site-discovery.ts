import type { FetchText } from './jobs/audit-job.js';

export type DiscoveredPage = { url: string; discoveredVia: 'root' | 'sitemap' | 'crawl' };

export type DiscoverySources = { root?: boolean; sitemap?: boolean; crawl?: boolean };

const xmlText = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

const locations = (xml: string) =>
  Array.from(xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi), (match) =>
    xmlText(match[1]?.trim() ?? ''),
  ).filter(Boolean);

function internalUrl(raw: string, base: URL): string | undefined {
  try {
    const url = new URL(raw, base);
    if (url.origin !== base.origin || !['http:', 'https:'].includes(url.protocol)) return;
    url.hash = '';
    return url.toString();
  } catch {
    return;
  }
}

function links(html: string, base: URL): string[] {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi), (match) =>
    internalUrl(match[1] ?? '', base),
  ).filter((url): url is string => Boolean(url));
}

export async function discoverSite(
  rootUrl: string,
  fetchText: FetchText,
  maxPages = 0,
  sources: DiscoverySources = {},
): Promise<DiscoveredPage[]> {
  const useRoot = sources.root ?? true;
  const useSitemap = sources.sitemap ?? true;
  const useCrawl = sources.crawl ?? true;

  const root = new URL(rootUrl);
  root.hash = '';
  const found = new Map<string, DiscoveredPage['discoveredVia']>(
    useRoot ? [[root.toString(), 'root']] : [],
  );
  const sitemapQueue = useSitemap ? [new URL('/sitemap.xml', root).toString()] : [];
  const seenSitemaps = new Set<string>();
  let sitemapHead = 0;

  if (useSitemap) {
    try {
      const robots = await fetchText(new URL('/robots.txt', root).toString());
      for (const match of robots.text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) {
        const url = new URL(match[1] ?? '', root);
        if (['http:', 'https:'].includes(url.protocol)) sitemapQueue.push(url.toString());
      }
    } catch {
      // /sitemap.xml remains the conventional fallback.
    }
  }

  while (sitemapHead < sitemapQueue.length && (maxPages === 0 || found.size < maxPages) && seenSitemaps.size < 50) {
    const sitemapUrl = sitemapQueue[sitemapHead++]!;
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    try {
      const response = await fetchText(sitemapUrl, { headers: { Accept: 'application/xml,text/xml' } });
      if (response.status !== 200) continue;
      const isIndex = /<sitemapindex\b/i.test(response.text);
      for (const raw of locations(response.text)) {
        if (isIndex) {
          try {
            const sitemap = new URL(raw, sitemapUrl);
            if (['http:', 'https:'].includes(sitemap.protocol)) sitemapQueue.push(sitemap.toString());
          } catch {
            // Ignore malformed nested sitemap URLs.
          }
        } else {
          const url = internalUrl(raw, root);
          if (url && (maxPages === 0 || found.size < maxPages) && !found.has(url)) found.set(url, 'sitemap');
        }
      }
    } catch {
      // Missing or malformed sitemaps fall through to the internal-link crawl.
    }
  }

  if (useCrawl && found.size === (useRoot ? 1 : 0)) {
    const crawlQueue = [root.toString()];
    const crawled = new Set<string>();
    let crawlHead = 0;
    while (crawlHead < crawlQueue.length && (maxPages === 0 || found.size < maxPages)) {
      const url = crawlQueue[crawlHead++]!;
      if (crawled.has(url)) continue;
      crawled.add(url);
      try {
        const response = await fetchText(url, { headers: { Accept: 'text/html' } });
        if (response.status < 200 || response.status >= 400) continue;
        for (const next of links(response.text, new URL(url))) {
          if (!found.has(next) && (maxPages === 0 || found.size < maxPages)) {
            found.set(next, 'crawl');
            crawlQueue.push(next);
          }
        }
      } catch {
        // One broken page must not stop discovery of the rest of the domain.
      }
    }
  }

  return Array.from(found, ([url, discoveredVia]) => ({ url, discoveredVia }));
}
