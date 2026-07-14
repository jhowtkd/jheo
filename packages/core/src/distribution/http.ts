import { JSONPath } from 'jsonpath-plus';
import type { Publisher, PublishRequest, PublishResult } from './types.js';

export type HttpAuth =
  | { scheme: 'none' }
  | { scheme: 'basic'; username: string; password: string }
  | { scheme: 'bearer'; token: string };

export interface HttpConfig {
  endpointUrl: string;
  method: 'POST';
  headers: Record<string, string>;
  bodyTemplate?: string;
  auth?: HttpAuth;
  responsePath?: { externalId?: string; externalUrl?: string };
}

function renderBody(template: string, content: PublishRequest['content']): string {
  let out = template;
  for (const [k, v] of Object.entries(content.frontMatter)) {
    const safe = typeof v === 'string' ? v : JSON.stringify(v);
    out = out.replaceAll(`{{frontMatter.${k}}}`, safe);
  }
  out = out.replaceAll('{{body}}', content.body);
  return out;
}

function authHeader(auth: HttpAuth | undefined): string | undefined {
  if (!auth) return undefined;
  if (auth.scheme === 'none') return undefined;
  if (auth.scheme === 'basic') {
    return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  }
  return `Bearer ${auth.token}`;
}

export class HttpPublisher implements Publisher {
  type = 'http' as const;

  async publish(req: PublishRequest, fetchFn: typeof fetch): Promise<PublishResult> {
    const c = req.config as HttpConfig;
    const body = c.bodyTemplate
      ? renderBody(c.bodyTemplate, req.content)
      : JSON.stringify({ frontMatter: req.content.frontMatter, body: req.content.body });

    const headers: Record<string, string> = { ...c.headers };
    const ah = authHeader(c.auth);
    if (ah) headers.Authorization = ah;

    const init: RequestInit = {
      method: 'POST',
      headers,
      body,
    };
    if (req.signal) init.signal = req.signal;

    const res = await fetchFn(c.endpointUrl, init);
    const text = await res.text();
    if (!res.ok) throw new Error(`http ${res.status}: ${text.slice(0, 256)}`);

    let externalId: string | undefined;
    let externalUrl: string | undefined;
    if (c.responsePath) {
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // non-JSON body; JSONPath won't find anything
      }
      if (c.responsePath.externalId) {
        const r = JSONPath({ path: c.responsePath.externalId, json: parsed as object });
        externalId = r.length > 0 ? String(r[0]) : undefined;
      }
      if (c.responsePath.externalUrl) {
        const r = JSONPath({ path: c.responsePath.externalUrl, json: parsed as object });
        externalUrl = r.length > 0 ? String(r[0]) : undefined;
      }
    }

    const result: PublishResult = {
      raw: {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: text.slice(0, 4096),
      },
    };
    if (externalId !== undefined) result.externalId = externalId;
    if (externalUrl !== undefined) result.externalUrl = externalUrl;
    return result;
  }
}
