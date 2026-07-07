import type { Job } from 'bullmq';
import { runAudit } from '@jheo/core';
import type { AuditJobData } from '../queue.js';
import { prisma } from '../db.js';

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
      const htmlRes = await opts.fetchText(project.rootUrl);

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

      const ctx = {
        url: project.rootUrl,
        html: htmlRes.text,
        fetchText: fetchTextDedup,
        log() {},
        // Derived view state — plugins can read these instead of re-walking
        // the entire HTML body. Keeps a strong reference while the audit
        // runs, then becomes GC-eligible when `ctx` goes out of scope.
        [PLAIN_TEXT]: htmlRes.text
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .filter(Boolean),
        [JSONLD_BLOCKS]: Array.from(
          htmlRes.text.matchAll(
            /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
          ),
        ),
      };

      const result = await runAudit(ctx);

      // createMany replaces N round-trips (one per finding) with one. The
      // combined update is run in the same statement for atomicity.
      await prisma.$transaction([
        ...(result.findings.length > 0
          ? [
              prisma.finding.createMany({
                data: result.findings.map((f) => ({
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
          data: { status: 'completed', finishedAt: new Date(), score: result.score as object },
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
