export type SuggestionCategory = 'seo' | 'geo' | 'cwv' | 'a11y' | 'content' | 'overall';

export type SuggestionContextInput = {
  finding: { id: string; category: string; severity: string; message: string; url: string };
  page: { id: string; url: string; htmlSnapshot: string };
  gsc?: { impressions: number; ctr: number; position: number };
  locale: 'en' | 'pt-BR';
};

export type SuggestionContext = {
  category: SuggestionCategory;
  severity: string;
  findingMessage: string;
  findingId: string;
  pageUrl: string;
  htmlSlice: string;
  gsc?: { impressions: number; ctr: number; position: number };
  locale: 'en' | 'pt-BR';
};

const MAX_SLICE = 8 * 1024; // 8 KB

function sliceSeo(html: string): string {
  const m = html.match(/<head[\s\S]*?<\/head>/i);
  return (m ? m[0] : html).slice(0, MAX_SLICE);
}

function sliceGeo(html: string): string {
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';
  const ld = (html.match(/<script[^>]*type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi) ?? []).join('\n');
  const llms = html.match(/<link[^>]+rel=["']llms[^"']*["'][^>]*>/i)?.[0] ?? '';
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0]?.slice(0, 1024) ?? '';
  return (head + '\n' + ld + '\n' + llms + '\n' + body).slice(0, MAX_SLICE);
}

function sliceCwv(html: string, findingMessage: string): string {
  // Try to pull the node hinted at in the message; fall back to first 1KB of body.
  const hint = findingMessage.match(/(?:src|href)=["']([^"']+)["']/i)?.[1];
  if (hint) {
    const re = new RegExp(`<[^>]*(?:src|href)=["']${hint.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}["'][^>]*>`, 'i');
    const m = html.match(re);
    if (m) return m[0].slice(0, MAX_SLICE);
  }
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  return body.slice(0, 1024);
}

function sliceA11y(html: string, findingMessage: string): string {
  // Try to extract a tag/id hint; fall back to first 2KB of body.
  const idHint = findingMessage.match(/(?:#|id=)([\w-]+)/)?.[1];
  if (idHint) {
    const re = new RegExp(`<[^>]*id=["']${idHint}["'][^>]*>[\\s\\S]*?</[a-z0-9]+>`, 'i');
    const m = html.match(re);
    if (m) return m[0].slice(0, MAX_SLICE);
  }
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  return body.slice(0, 2048);
}

function sliceContent(html: string): string {
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  return body.slice(0, 4096);
}

export function buildSuggestionContext(input: SuggestionContextInput): SuggestionContext {
  const cat = input.finding.category as SuggestionCategory;
  if (cat === 'overall') throw new Error('CATEGORY_NOT_SUPPORTED');

  let htmlSlice: string;
  switch (cat) {
    case 'seo': htmlSlice = sliceSeo(input.page.htmlSnapshot); break;
    case 'geo': htmlSlice = sliceGeo(input.page.htmlSnapshot); break;
    case 'cwv': htmlSlice = sliceCwv(input.page.htmlSnapshot, input.finding.message); break;
    case 'a11y': htmlSlice = sliceA11y(input.page.htmlSnapshot, input.finding.message); break;
    case 'content': htmlSlice = sliceContent(input.page.htmlSnapshot); break;
    default: htmlSlice = input.page.htmlSnapshot.slice(0, MAX_SLICE);
  }

  const ctx: SuggestionContext = {
    category: cat,
    severity: input.finding.severity,
    findingId: input.finding.id,
    findingMessage: input.finding.message,
    pageUrl: input.page.url,
    htmlSlice,
    locale: input.locale,
  };
  if (input.gsc) ctx.gsc = input.gsc;
  return ctx;
}
