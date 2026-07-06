import type { AuditContext, Finding } from '../../types.js';

const TITLE_MIN = 10;
const TITLE_MAX = 70;
const DESC_MIN = 50;
const DESC_MAX = 160;

function readMeta(html: string, attr: string, value?: string): string | null {
  const re = value
    ? new RegExp(`<meta\\s+[^>]*${attr}=["']${value}["'][^>]*content=["']([^"']+)["']`, 'i')
    : new RegExp(`<meta\\s+[^>]*${attr}=["']([^"']+)["']`, 'gi');
  if (!value) {
    const matches = html.matchAll(re);
    const last = Array.from(matches).pop();
    return last?.[1] ?? null;
  }
  const m = html.match(re);
  return m ? (m[1] ?? null) : null;
}

function readTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1] ? m[1].trim() : null;
}

export async function checkMeta(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const title = readTitle(ctx.html);
  if (!title) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'meta.missing-title',
      message: 'Page has no <title> element.',
      url: ctx.url,
      evidence: {},
    });
  } else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.title-length',
      message: `Title length ${title.length} is outside the recommended ${TITLE_MIN}-${TITLE_MAX} character range.`,
      url: ctx.url,
      evidence: { title },
    });
  }

  const description = readMeta(ctx.html, 'name', 'description');
  if (!description) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.missing-description',
      message: 'Page has no <meta name="description"> element.',
      url: ctx.url,
      evidence: {},
    });
  } else if (description.length < DESC_MIN || description.length > DESC_MAX) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.description-length',
      message: `Description length ${description.length} is outside the recommended ${DESC_MIN}-${DESC_MAX} character range.`,
      url: ctx.url,
      evidence: { description },
    });
  }

  const canonical = ctx.html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!canonical) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'meta.missing-canonical',
      message: 'Page has no rel="canonical" link element.',
      url: ctx.url,
      evidence: {},
    });
  }

  const viewport = readMeta(ctx.html, 'name', 'viewport');
  if (!viewport) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.missing-viewport',
      message: 'Page has no <meta name="viewport"> element.',
      url: ctx.url,
      evidence: {},
    });
  }

  return out;
}
