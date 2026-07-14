import type { AuditContext, Finding } from '../types.js';
import { checkMeta } from './seo/meta.js';
import { checkHeadings } from './seo/headings.js';
import { checkSitemap } from './seo/sitemap.js';
import { checkRobotsTxt } from './seo/robots-txt.js';
import { checkLinks } from './seo/links.js';
import { checkImages } from './seo/images.js';
import { checkOpenGraph } from './seo/open-graph.js';
import { checkJsonLd } from './seo/json-ld.js';
import { checkGscLowCtr } from './seo/gsc-low-ctr.js';
import { checkLlmsTxt } from './geo/llms-txt.js';
import { checkAiCrawlerAccess } from './geo/ai-crawler-access.js';
import { checkCitability } from './geo/citability.js';
import { checkMarkdownParallel } from './geo/markdown-parallel.js';
import { checkFaqStructure } from './geo/faq-structure.js';
import { checkSchemaCoverage } from './geo/schema-coverage.js';
import { checkLighthouse } from './cwv/lighthouse.js';
import { checkRequests } from './cwv/requests.js';
import { checkHints } from './cwv/hints.js';
import { checkCache } from './cwv/cache.js';
import { checkCompression } from './cwv/compression.js';
import { checkLangAttr } from './a11y/lang-attr.js';
import { checkSkipLinks } from './a11y/skip-links.js';
import { checkAxe } from './a11y/axe-core.js';
import { checkContrast } from './a11y/contrast.js';
import { checkLangConsistency } from './content/lang-consistency.js';
import { checkReadability } from './content/readability.js';
import { checkThinContent } from './content/thin-content.js';
import { checkDates } from './content/dates.js';
import { scoreFindings } from './score.js';

export type AuditPlugin = (ctx: AuditContext) => Promise<Finding[]>;

export const ALL_PLUGINS: AuditPlugin[] = [
  checkMeta,
  checkHeadings,
  checkSitemap,
  checkRobotsTxt,
  checkLinks,
  checkImages,
  checkOpenGraph,
  checkJsonLd,
  checkGscLowCtr,
  checkLlmsTxt,
  checkAiCrawlerAccess,
  checkCitability,
  checkMarkdownParallel,
  checkFaqStructure,
  checkSchemaCoverage,
  checkLighthouse,
  checkRequests,
  checkHints,
  checkCache,
  checkCompression,
  checkLangAttr,
  checkSkipLinks,
  checkAxe,
  checkContrast,
  checkLangConsistency,
  checkReadability,
  checkThinContent,
  checkDates,
];

// Captured eagerly so a plugin failure can be attributed even if its
// implementation throws synchronously. All 28 plugins are named function
// declarations (export async function checkX...), so `.name` is reliable.
const PLUGIN_NAMES = ALL_PLUGINS.map((p) => p.name);

/** Max concurrent audit plugins (network-heavy plugins share this budget). */
export const PLUGIN_CONCURRENCY = 6;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]!, i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runAudit(ctx: AuditContext): Promise<{
  findings: Finding[];
  failures: { rule: string; message: string }[];
  score: ReturnType<typeof scoreFindings>;
}> {
  const settled = await mapPool(ALL_PLUGINS, PLUGIN_CONCURRENCY, (p) => p(ctx));
  const findings: Finding[] = [];
  const failures: { rule: string; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') findings.push(...r.value);
    else failures.push({ rule: PLUGIN_NAMES[i] ?? `plugin-${i}`, message: String(r.reason) });
  });
  return { findings, failures, score: scoreFindings(findings) };
}
