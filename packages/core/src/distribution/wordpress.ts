import type { Publisher, PublishRequest, PublishResult } from './types.js';

export class WordPressPublishError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(`WordPress publish failed (${status}): ${bodyText.slice(0, 200)}`);
    this.name = 'WordPressPublishError';
  }
}

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  defaultStatus: 'draft' | 'publish';
}

function authHeader(c: WordPressConfig): string {
  return `Basic ${Buffer.from(`${c.username}:${c.appPassword}`).toString('base64')}`;
}

/**
 * Resolve a WordPress taxonomy term (category or tag) by case-insensitive
 * name match, creating it if absent. The endpoint string MUST be the taxonomy
 * endpoint name (`categories` or `tags`) — callers are responsible for picking
 * the right one. Previously this function was called with a hard-coded
 * 'categories' for what was actually a tag loop, silently tagging posts as
 * categories.
 */
async function findOrCreateTerm(
  endpoint: 'categories' | 'tags',
  name: string,
  siteUrl: string,
  c: WordPressConfig,
  fetchFn: typeof fetch,
): Promise<number> {
  const searchUrl = `${siteUrl}/wp-json/wp/v2/${endpoint}?search=${encodeURIComponent(name)}&per_page=100`;
  const searchRes = await fetchFn(searchUrl, {
    method: 'GET',
    headers: { Authorization: authHeader(c) },
  });
  if (!searchRes.ok) throw new Error(`wp ${endpoint} search ${searchRes.status}`);

  // res.json() streams + parses in one pass — the previous
  // searchRes.clone().text() + JSON.parse allocated an extra UTF-8 string.
  const matches = (await searchRes.json().catch(() => [])) as Array<{ id: number; name: string }>;
  const list = Array.isArray(matches) ? matches : [];
  const found = list.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;

  const createRes = await fetchFn(`${siteUrl}/wp-json/wp/v2/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: authHeader(c), 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!createRes.ok) throw new Error(`wp ${endpoint} create ${createRes.status}`);
  // Wrap the create-response parse so a non-JSON body surfaces a clear error
  // rather than the unhelpful "Unexpected token < in JSON at position 0".
  let created: { id: number };
  try {
    created = (await createRes.json()) as { id: number };
  } catch (e) {
    throw new Error(`wp ${endpoint} create response parse failed: ${(e as Error).message}`);
  }
  return created.id;
}

export class WordPressPublisher implements Publisher {
  type = 'wordpress' as const;

  async publish(req: PublishRequest, fetchFn: typeof fetch): Promise<PublishResult> {
    const c = req.config as WordPressConfig;
    const fm = req.content.frontMatter;
    const url = `${c.siteUrl}/wp-json/wp/v2/posts`;
    const body: Record<string, unknown> = {
      title: fm.title,
      slug: fm.slug,
      content: req.content.body,
      excerpt: fm.description,
      status: c.defaultStatus,
    };
    if (req.termIds?.post_tag && req.termIds.post_tag.length > 0) body.tags = req.termIds.post_tag;
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: authHeader(c),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    };
    if (req.signal) init.signal = req.signal;
    const res = await fetchFn(url, init);
    const text = await res.text();
    if (!res.ok && (res.status < 400 || res.status >= 500)) {
      throw new WordPressPublishError(res.status, text);
    }
    if (!res.ok) {
      throw new Error(`wp post ${res.status}: ${text}`);
    }
    const json = JSON.parse(text) as { id: number; link?: string };

    // Best-effort term resolution. Tags go into the `tags` taxonomy and
    // categories (if front-matter ever exposes them) into `categories`.
    // The previous version hard-coded 'categories' for the tag loop, which
    // silently landed every tag in the categories taxonomy.
    for (const tag of fm.tags) {
      try {
        await findOrCreateTerm('tags', tag, c.siteUrl, c, fetchFn);
      } catch (e) {
        // Best-effort: a tag lookup/creation failure mustn't undo the
        // already-created post. Surface it via stderr so misconfigured WP
        // installs are diagnosable in production logs.
        // Best-effort: avoid console.* — surface once via structured stderr JSON.
        process.stderr.write(
          JSON.stringify({ level: 'warn', msg: 'wp tag resolution failed', tag, err: String(e) }) +
            '\n',
        );
      }
    }
    for (const cat of fm.targetSites ?? []) {
      // Reserved for future category-driven routing; intentionally no-op.
      void cat;
    }

    const result: PublishResult = {
      externalId: String(json.id),
      raw: {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: text.slice(0, 4096),
      },
    };
    if (json.link !== undefined) result.externalUrl = json.link;
    return result;
  }
}
