import type { ParsedMarkdown } from '../generation/schema.js';
import type { Publisher, PublishRequest, PublishResult } from './types.js';

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  defaultStatus: 'draft' | 'publish';
}

function authHeader(c: WordPressConfig): string {
  return `Basic ${Buffer.from(`${c.username}:${c.appPassword}`).toString('base64')}`;
}

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
  const searchText = await searchRes.clone().text();
  let matches: unknown = [];
  try {
    matches = JSON.parse(searchText) as unknown;
  } catch {
    matches = [];
  }
  const list = Array.isArray(matches) ? (matches as Array<{ id: number; name: string }>) : [];
  const found = list.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  const createRes = await fetchFn(`${siteUrl}/wp-json/wp/v2/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: authHeader(c), 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!createRes.ok) throw new Error(`wp ${endpoint} create ${createRes.status}`);
  const createText = await createRes.text();
  const created = JSON.parse(createText) as { id: number };
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
    if (!res.ok) {
      throw new Error(`wp post ${res.status}: ${text}`);
    }
    const json = JSON.parse(text) as { id: number; link?: string };

    // Best-effort term resolution after post; results not attached to the post body.
    for (const tag of fm.tags) {
      try {
        await findOrCreateTerm('categories', tag, c.siteUrl, c, fetchFn);
      } catch {
        // Term resolution is best-effort; post is the source of truth.
      }
    }
    for (const cat of fm.targetSites ?? []) {
      void cat;
    }

    const result: PublishResult = {
      externalId: String(json.id),
      raw: { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: text.slice(0, 4096) },
    };
    if (json.link !== undefined) result.externalUrl = json.link;
    return result;
  }
}