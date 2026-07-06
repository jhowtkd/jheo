import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AgentPublisher } from '../../src/distribution/agent.js';

const sampleMarkdown = {
  frontMatter: {
    title: 'Hello world from agent',
    slug: 'hello-world-from-agent',
    description: 'a'.repeat(60),
    tags: ['ai'],
    date: '2026-07-06',
    sources: [],
    targetSites: ['https://example.com'],
  },
  body: 'paragraph one\n\nparagraph two with **markdown**.',
};

describe('distribution/agent', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'jheo-agent-'));
  });
  beforeEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes index.html, llms.txt, article.html, robots.txt, sitemap.xml to outputDir', async () => {
    const r = await new AgentPublisher().publish(
      { content: sampleMarkdown, config: { siteName: 'My Site', themeColor: '#0ea5e9', assetFolder: 'assets', outputDir: tmp } },
      globalThis.fetch,
    );
    const outDir = r.externalUrl!.replace(/^file:\/\//, '');
    const files = readdirSync(outDir);
    expect(files).toContain('index.html');
    expect(files).toContain('article.html');
    expect(files).toContain('llms.txt');
    expect(files).toContain('robots.txt');
    expect(files).toContain('sitemap.xml');
    expect(files).toContain('assets');
  });

  it('llms.txt contains H1 of site name', async () => {
    const r = await new AgentPublisher().publish(
      {
        content: sampleMarkdown,
        config: { siteName: 'Test Site X', themeColor: '#fff', assetFolder: 'assets', outputDir: tmp },
      },
      globalThis.fetch,
    );
    const llms = readFileSync(join(r.externalUrl!.replace(/^file:\/\//, ''), 'llms.txt'), 'utf8');
    expect(llms).toContain('# Test Site X');
  });

  it('article.html renders frontmatter title as h1 and body as markdown-ish', async () => {
    const r = await new AgentPublisher().publish(
      {
        content: sampleMarkdown,
        config: { siteName: 'S', themeColor: '#fff', assetFolder: 'assets', outputDir: tmp },
      },
      globalThis.fetch,
    );
    const html = readFileSync(join(r.externalUrl!.replace(/^file:\/\//, ''), 'article.html'), 'utf8');
    expect(html).toContain('<h1>Hello world from agent</h1>');
    expect(html).toContain('<p>paragraph one');
  });

  it('throws if filesystem write fails (default outputDir invalid)', async () => {
    const r = new AgentPublisher();
    await expect(
      r.publish(
        {
          content: sampleMarkdown,
          // Intentionally path that cannot be created:
          config: { siteName: 'S', themeColor: '#fff', assetFolder: 'assets', outputDir: '/dev/null/forbidden/x' },
        },
        globalThis.fetch,
      ),
    ).rejects.toThrow();
  });
});
