import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSONPath } from 'jsonpath-plus';
import { HttpPublisher } from '../../src/distribution/http.js';

const baseConfig = {
  endpointUrl: 'https://example.com/api/content',
  method: 'POST' as const,
  headers: { 'content-type': 'application/json' },
};

const sampleMarkdown = {
  frontMatter: {
    title: 'Hello',
    slug: 'hello',
    description: 'a'.repeat(60),
    tags: ['x'],
    date: '2026-07-06',
    sources: [],
    targetSites: ['https://example.com'],
  },
  body: 'body text',
};

describe('distribution/http', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('POSTs JSON body to endpointUrl with config headers', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    await new HttpPublisher().publish({ content: sampleMarkdown, config: baseConfig }, globalThis.fetch);
    const call = fetchSpy.mock.calls[0]!;
    expect(call[0]).toBe('https://example.com/api/content');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('substitutes {{frontMatter.title}} and {{body}} via bodyTemplate', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    await new HttpPublisher().publish(
      {
        content: sampleMarkdown,
        config: { ...baseConfig, bodyTemplate: '{"title":"{{frontMatter.title}}","body":"{{body}}"}' },
      },
      globalThis.fetch,
    );
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.title).toBe('Hello');
    expect(body.body).toBe('body text');
  });

  it('adds Authorization basic when auth.scheme=basic', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    await new HttpPublisher().publish(
      {
        content: sampleMarkdown,
        config: { ...baseConfig, auth: { scheme: 'basic' as const, username: 'u', password: 'p' } },
      },
      globalThis.fetch,
    );
    const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
  });

  it('adds Authorization bearer when auth.scheme=bearer', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    await new HttpPublisher().publish(
      {
        content: sampleMarkdown,
        config: { ...baseConfig, auth: { scheme: 'bearer' as const, token: 'tok' } },
      },
      globalThis.fetch,
    );
    const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('extracts externalId and externalUrl via responsePath JSONPath', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 99, link: 'https://x/99' }), { status: 200 }),
    );
    const r = await new HttpPublisher().publish(
      {
        content: sampleMarkdown,
        config: {
          ...baseConfig,
          responsePath: { externalId: '$.id', externalUrl: '$.link' },
        },
      },
      globalThis.fetch,
    );
    expect(r.externalId).toBe('99');
    expect(r.externalUrl).toBe('https://x/99');
  });

  it('throws on non-2xx', async () => {
    fetchSpy.mockResolvedValue(new Response('oops', { status: 500 }));
    await expect(
      new HttpPublisher().publish({ content: sampleMarkdown, config: baseConfig }, globalThis.fetch),
    ).rejects.toThrow(/500/);
  });
});