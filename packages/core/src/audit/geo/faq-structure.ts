import type { AuditContext, Finding } from '../../types.js';

export async function checkFaqStructure(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const blocks = Array.from(
    ctx.html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  let hasFaqSchema = false;
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1] ?? '');
      if (json['@type'] === 'FAQPage' || json['@graph']?.some?.((g: unknown) =>
        typeof g === 'object' && g !== null && (g as Record<string, unknown>)['@type'] === 'FAQPage',
      )) {
        hasFaqSchema = true;
      }
    } catch {
      // ignore invalid blocks here; json-ld plugin reports them
    }
  }
  const visibleFaq = /<\b(dt|summary|details)[\s>]/i.test(ctx.html);
  if (visibleFaq && !hasFaqSchema) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.faq.no-schema',
      message: 'Page has FAQ markup but no FAQPage JSON-LD schema.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
