import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Publisher, PublishRequest, PublishResult } from './types.js';

export interface AgentConfig {
  siteName: string;
  themeColor?: string;
  assetFolder?: string;
}

const DEFAULT_OUTPUT_DIR = `/data/agent-bundles`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBodyToHtml(md: string): string {
  return md
    .split(/\n\n+/)
    .map((p) => {
      const escaped = escapeHtml(p);
      const withStrong = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      const withEm = withStrong.replace(/\*(.+?)\*/g, '<em>$1</em>');
      return `<p>${withEm.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

function publishIdDir(req: PublishRequest): string {
  // Worker provides PublishId via signal context; here we derive from a deterministic key from the publishRowId if present.
  // F3 MVP: use a temp dir per agent publish (no id flow yet — worker creates the dir).
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return id;
}

export class AgentPublisher implements Publisher {
  type = 'agent' as const;

  async publish(req: PublishRequest, _fetchFn: typeof fetch): Promise<PublishResult> {
    const c = req.config as AgentConfig;
    const baseDir =
      (req.config as AgentConfig & { outputDir?: string }).outputDir ?? DEFAULT_OUTPUT_DIR;
    const dir = resolve(baseDir, publishIdDir(req));
    mkdirSync(dir, { recursive: true });
    const fm = req.content.frontMatter;

    const indexHtml = `<!doctype html>
<html lang="${escapeHtml((c as { lang?: string }).lang ?? 'en')}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(c.siteName)}</title>
<meta name="theme-color" content="${escapeHtml(c.themeColor ?? '#0ea5e9')}" />
</head>
<body>
<header><h1>${escapeHtml(c.siteName)}</h1></header>
<main><article>See <a href="./article.html">latest article</a>.</article></main>
</body>
</html>`;

    const articleHtml = `<!doctype html>
<html lang="${escapeHtml(fm.tags?.[0] ? 'en' : 'en')}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(fm.title)}</title>
<meta name="description" content="${escapeHtml(fm.description)}" />
</head>
<body>
<article>
<h1>${escapeHtml(fm.title)}</h1>
${renderBodyToHtml(req.content.body)}
</article>
</body>
</html>`;

    const llmsTxt = `# ${c.siteName}\n\n${req.content.body.slice(0, 2000)}\n`;
    const robotsTxt = `User-agent: *\nAllow: /\n`;
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>./article.html</loc></url>
</urlset>\n`;

    writeFileSync(join(dir, 'index.html'), indexHtml);
    writeFileSync(join(dir, 'article.html'), articleHtml);
    writeFileSync(join(dir, 'llms.txt'), llmsTxt);
    writeFileSync(join(dir, 'robots.txt'), robotsTxt);
    writeFileSync(join(dir, 'sitemap.xml'), sitemapXml);
    mkdirSync(join(dir, c.assetFolder ?? 'assets'), { recursive: true });

    return {
      externalUrl: `file://${dir}`,
      raw: { status: 200, headers: { 'x-agent': 'true' }, body: 'bundle written to ' + dir },
    };
  }
}
