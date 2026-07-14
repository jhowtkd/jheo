/**
 * Shared symbols + helpers for derived HTML views. The audit worker computes
 * these once per `ctx` and stashes them under well-known symbols; plugins
 * read them through the getters here. When the symbol isn't present
 * (e.g. direct plugin call from tests) the helpers fall back to deriving on
 * the spot, so behaviour is unchanged for standalone callers.
 */
export const PLAIN_TEXT_WORDS = Symbol('jheo.audit.plainTextWords');
export const JSONLD_BLOCKS = Symbol('jheo.audit.jsonLdBlocks');

const HTML_STRIP_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;
const JSONLD_RE = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Tokenised plain-text view (HTML stripped, whitespace normalised). */
export function plainTextWords(ctx: { html: string }): string[] {
  const cached = (ctx as unknown as Record<symbol, string[] | undefined>)[PLAIN_TEXT_WORDS];
  if (cached) return cached;
  return ctx.html
    .replace(HTML_STRIP_RE, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Pre-computed JSON-LD block matches (regex.exec[].groups[1] contains the body). */
export function jsonLdBlocks(ctx: { html: string }): RegExpExecArray[] {
  const cached = (ctx as unknown as Record<symbol, RegExpExecArray[] | undefined>)[JSONLD_BLOCKS];
  if (cached) return cached;
  return Array.from(ctx.html.matchAll(JSONLD_RE));
}
