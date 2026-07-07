import type { Job } from 'bullmq';
import { runAudit, type Finding } from '@jheo/core';
import type { PageAuditJobData } from '../queue.js';
import { prisma } from '../db.js';
import type { FetchText } from './audit-job.js';

const PLAIN_TEXT = Symbol('jheo.audit.plainText');
const JSONLD_BLOCKS = Symbol('jheo.audit.jsonLdBlocks');

export function makePageAuditHandler(opts: { fetchText: FetchText }) {
  return async function handle(job: Job<PageAuditJobData>) {
    const { pageAuditId, auditId, projectPageId, url } = job.data;
    const pageAudit = await prisma.pageAudit.findUnique({ where: { id: pageAuditId } });
    if (!pageAudit) return; // orphan — bail
    if (pageAudit.status === 'completed' || pageAudit.status === 'failed') return; // idempotency

    // Cancellation check (only for parented audits; standalone Phase 4 has no auditId)
    if (auditId) {
      const parent = await prisma.audit.findUnique({ where: { id: auditId } });
      if (parent?.status === 'cancelled') {
        await prisma.pageAudit.update({
          where: { id: pageAuditId },
          data: { status: 'skipped', finishedAt: new Date() },
        });
        return;
      }
    }

    const inflight = new Map<string, Promise<{ status: number; headers: Record<string, string>; text: string }>>();
    const fetchTextDedup: FetchText = (url, init) => {
      const key = `${url}|${JSON.stringify(init?.headers ?? {})}`;
      let p = inflight.get(key);
      if (!p) {
        p = opts.fetchText(url, init);
        inflight.set(key, p);
      }
      return p;
    };

    await prisma.pageAudit.update({
      where: { id: pageAuditId },
      data: { status: 'running', startedAt: new Date() },
    });
    try {
      const htmlRes = await fetchTextDedup(url);
      if (htmlRes.status < 200 || htmlRes.status >= 400) throw new Error(`HTTP ${htmlRes.status}`);
      const ctx = {
        url,
        html: htmlRes.text,
        fetchText: fetchTextDedup,
        log() {},
        [PLAIN_TEXT]: htmlRes.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean),
        [JSONLD_BLOCKS]: Array.from(htmlRes.text.matchAll(
          /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
        )),
      };
      const result = await runAudit(ctx);
      const pageScore = result.score as { overall: number; byCategory?: Record<string, number | null> };
      const finishedAt = new Date();
      await prisma.$transaction([
        prisma.finding.createMany({
          data: result.findings.map((f: Finding) => ({
            auditId: auditId!,
            pageAuditId,
            category: f.category,
            severity: f.severity,
            rule: f.rule,
            message: f.message,
            url: f.url,
            selector: f.selector ?? null,
            evidence: f.evidence as object,
          })),
        }),
        prisma.pageAudit.update({
          where: { id: pageAuditId },
          data: { status: 'completed', finishedAt, score: pageScore },
        }),
        prisma.projectPage.update({
          where: { id: projectPageId },
          data: { lastAuditedAt: finishedAt },
        }),
      ]);
    } catch (error) {
      await prisma.pageAudit.update({
        where: { id: pageAuditId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
          score: { overall: 0, byCategory: { content: 0 } },
        },
      });
      throw error; // BullMQ counts the failure → triggers retry
    }
  };
}
