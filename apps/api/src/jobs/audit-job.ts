import type { Job } from 'bullmq';
import { GSC_SNAPSHOT, runAudit, type Finding } from '@jheo/core';
import type { AuditJobData } from '../queue.js';
import { prisma } from '../db.js';
import { discoverSite } from '../site-discovery.js';
import { buildGscSnapshotContext } from '../gsc-snapshot-context.js';

export type FetchText = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ status: number; headers: Record<string, string>; text: string }>;

// Symbols so we can stash derived view state on the AuditContext without
// polluting its public shape (which the @jheo/core plugins read).
const PLAIN_TEXT = Symbol('jheo.audit.plainText');
const JSONLD_BLOCKS = Symbol('jheo.audit.jsonLdBlocks');

export function makeAuditHandler(opts: { fetchText: FetchText }) {
  return async function handle(job: Job<AuditJobData>) {
    const audit = await prisma.audit.findUnique({ where: { id: job.data.auditId } });
    if (!audit) return;
    // Idempotency guard: BullMQ retries can re-enter the handler after a
    // successful run. Don't clobber 'completed'/'failed' state back to 'running'.
    if (audit.status === 'completed' || audit.status === 'failed') return;
    const project = await prisma.project.findUnique({ where: { id: audit.projectId } });
    if (!project) {
      await prisma.audit.update({ where: { id: audit.id }, data: { status: 'failed' } });
      return;
    }
    await prisma.audit.update({
      where: { id: audit.id },
      data: { status: 'running', startedAt: new Date() },
    });
    try {
      // Inflight dedupe: many plugins ask fetchText for the same relative
      // URL (e.g. /robots.txt is fetched by both checkRobotsTxt and
      // checkAiCrawlerAccess). Without dedup this fires the same HTTP
      // request twice on every audit. Key includes init?.headers so two
      // calls with different Accepts don't collapse onto each other.
      const inflight = new Map<
        string,
        Promise<{ status: number; headers: Record<string, string>; text: string }>
      >();
      const fetchTextDedup: FetchText = (url, init) => {
        const key = `${url}|${JSON.stringify(init?.headers ?? {})}`;
        let p = inflight.get(key);
        if (!p) {
          p = opts.fetchText(url, init);
          inflight.set(key, p);
        }
        return p;
      };
      const configuredMax = Number((audit.configSnapshot as { maxPages?: unknown } | undefined)?.maxPages);
      const maxPages = Number.isInteger(configuredMax) && configuredMax > 0
        ? Math.min(configuredMax, 5_000)
        : 500;
      const pages = await discoverSite(project.rootUrl, fetchTextDedup, maxPages);
      await prisma.projectPage.createMany({
        data: pages.map((page) => ({ projectId: project.id, ...page })),
        skipDuplicates: true,
      });

      let gscSnapshot: Awaited<ReturnType<typeof buildGscSnapshotContext>>;
      try {
        gscSnapshot = await buildGscSnapshotContext(prisma, project.id);
      } catch {
        gscSnapshot = undefined;
      }

      const findings: Finding[] = [];
      const scores: Array<{ overall: number; byCategory?: Record<string, number | null> }> = [];

      for (const page of pages) {
        try {
          const htmlRes = await fetchTextDedup(page.url);
          if (htmlRes.status < 200 || htmlRes.status >= 400) throw new Error(`HTTP ${htmlRes.status}`);
          const ctx = {
            url: page.url,
            html: htmlRes.text,
            fetchText: fetchTextDedup,
            log() {},
            [PLAIN_TEXT]: htmlRes.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean),
            [JSONLD_BLOCKS]: Array.from(htmlRes.text.matchAll(
              /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
            )),
            ...(gscSnapshot ? { [GSC_SNAPSHOT]: gscSnapshot } : {}),
          };
          const result = await runAudit(ctx);
          findings.push(...result.findings);
          scores.push(result.score as { overall: number; byCategory?: Record<string, number | null> });
        } catch (error) {
          findings.push({
            category: 'content',
            severity: 'error',
            rule: 'page.unreachable',
            message: `Page could not be audited: ${error instanceof Error ? error.message : String(error)}`,
            url: page.url,
            evidence: {},
          });
          scores.push({ overall: 0, byCategory: { content: 0 } });
        }
      }

      const categories = ['seo', 'cwv', 'geo', 'a11y', 'content'];
      const byCategory = Object.fromEntries(categories.map((category) => {
        const values = scores.map((score) => score.byCategory?.[category]).filter((value): value is number => value !== null && value !== undefined);
        return [category, values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null];
      }));
      const score = {
        overall: scores.length ? Math.round(scores.reduce((sum, value) => sum + value.overall, 0) / scores.length) : 0,
        byCategory,
        pagesAudited: pages.length,
        discoveryLimitReached: pages.length === maxPages,
      };
      const finishedAt = new Date();

      // createMany replaces N round-trips (one per finding) with one. The
      // combined update is run in the same statement for atomicity.
      await prisma.$transaction([
        ...(findings.length > 0
          ? [
              prisma.finding.createMany({
                data: findings.map((f) => ({
                  auditId: audit.id,
                  category: f.category,
                  severity: f.severity,
                  rule: f.rule,
                  message: f.message,
                  url: f.url,
                  selector: f.selector ?? null,
                  evidence: f.evidence as object,
                })),
              }),
            ]
          : []),
        prisma.audit.update({
          where: { id: audit.id },
          data: { status: 'completed', finishedAt, score },
        }),
        prisma.projectPage.updateMany({
          where: { projectId: project.id, url: { in: pages.map((page) => page.url) } },
          data: { lastAuditedAt: finishedAt },
        }),
      ]);
    } catch (err) {
      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'failed', finishedAt: new Date() },
      });
      throw err;
    }
  };
}
