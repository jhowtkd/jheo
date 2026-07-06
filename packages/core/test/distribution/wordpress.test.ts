import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WordPressPublisher } from '../../src/distribution/wordpress.js';

const baseConfig = {
  siteUrl: 'https://example.com',
  username: 'admin',
  appPassword: 'abcd efgh ijkl mnop',
  defaultStatus: 'draft',
};

const sampleMarkdown = {
  frontMatter: {
    title: 'Hello world',
    slug: 'hello-world',
    description: 'a'.repeat(60),
    tags: ['ai'],
    date: '2026-07-06',
    sources: [],
    targetSites: ['https://example.com'],
  },
  body: 'body body body body body body body body.',
};

describe('distribution/wordpress', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('POSTs to /wp-json/wp/v2/posts and returns id+link from 201', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 42, link: 'https://example.com/?p=42' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const r = await new WordPressPublisher().publish(
      { content: sampleMarkdown, config: baseConfig },
      globalThis.fetch,
    );
    expect(r.externalId).toBe('42');
    expect(r.externalUrl).toBe('https://example.com/?p=42');
    const call = fetchSpy.mock.calls[0]!;
    const [url, init] = call as [string, RequestInit];
    expect(url).toBe('https://example.com/wp-json/wp/v2/posts');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('admin:abcd efgh ijkl mnop').toString('base64')}`);
    const body = JSON.parse(init.body as string);
    expect(body.title).toBe('Hello world');
    expect(body.slug).toBe('hello-world');
    expect(body.status).toBe('draft');
  });

  it('passes status=publish when configured', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 1, link: 'https://x/?p=1' }), { status: 201 }),
    );
    await new WordPressPublisher().publish(
      { content: sampleMarkdown, config: { ...baseConfig, defaultStatus: 'publish' } },
      globalThis.fetch,
    );
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.status).toBe('publish');
  });

  it('resolves categories by name and creates missing ones', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42, link: 'https://x/?p=42' }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 7, name: 'ai' }]), { status: 200 }),
      );
    const r = await new WordPressPublisher().publish(
      { content: sampleMarkdown, config: baseConfig },
      globalThis.fetch,
    );
    expect(r.externalId).toBe('42');
    // Only 2 calls: post + categories lookup (tags empty so no tags lookup).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const catCall = fetchSpy.mock.calls[1]!;
    expect(catCall[0]).toBe('https://example.com/wp-json/wp/v2/categories?search=ai&per_page=100');
  });

  it('creates a category when none exists', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, link: 'x' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // no existing cat
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 9, name: 'newcat' }), { status: 201 }));
    await new WordPressPublisher().publish(
      {
        content: { ...sampleMarkdown, frontMatter: { ...sampleMarkdown.frontMatter, tags: ['newcat'] } },
        config: baseConfig,
      },
      globalThis.fetch,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const createCall = fetchSpy.mock.calls[2]!;
    const body = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(body.name).toBe('newcat');
  });

  it('throws on 5xx', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      new WordPressPublisher().publish(
        { content: sampleMarkdown, config: baseConfig },
        globalThis.fetch,
      ),
    ).rejects.toThrow(/500/);
  });

  it('throws on 4xx', async () => {
    fetchSpy.mockResolvedValue(new Response('forbidden', { status: 403 }));
    await expect(
      new WordPressPublisher().publish(
        { content: sampleMarkdown, config: baseConfig },
        globalThis.fetch,
      ),
    ).rejects.toThrow(/403/);
  });
});