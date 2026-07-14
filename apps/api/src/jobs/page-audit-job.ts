import type { Job } from 'bullmq';
import { runAudit, type Finding } from '@jheo/core';
import type { PageAuditJobData } from '../queue.js';
import { prisma } from '../db.js';
import type { FetchText } from './audit-job.js';
import { fetchDedupKey } from '../fetch-dedup-key.js';

const PLAIN_TEXT = Symbol('jheo.audit.plainText');
const JSONLD_BLOCKS = Symbol('jheo.audit.jsonLdBlocks');

/**
 * For each new finding, attach the id of the most recent prior "head" finding
 * (one with `previousFindingId IS NULL`) sharing the same `(url, category, rule)`
 * scoped to the same `projectPageId`. Forms the head→next chain used by the
 * re-audit diff to label findings as NEW, UNCHANGED, IMPROVEMENT, REGRESSION,
 * or FIXED. Lineage is computed outside the createMany transaction per F5.4-T2
 * brief; races are acceptable for now (re-audits are user-initiated, low volume).
 */
export async function attachLineage(
  findings: Finding[],
  pageAuditId: string,
  projectPageId: string,
): Promise<Array<Omit<Finding, 'previousFindingId'> & { previousFindingId: string | null }>> {
  if (findings.length === 0) return [];

  // One query for all prior heads on this page, then O(1) Map lookups.
  // Keys are `${url}\0${category}\0${rule}` — same identity used by re-audit diff.
  const priors = await prisma.finding.findMany({
    where: {
      pageAudit: { projectPageId },
      previousFindingId: null,
    },
    orderBy: { id: 'desc' },
    select: { id: true, url: true, category: true, rule: true },
  });
  const priorByKey = new Map<string, string>();
  for (const p of priors) {
    const key = `${p.url}\0${p.category}\0${p.rule}`;
    if (!priorByKey.has(key)) priorByKey.set(key, p.id);
  }

  return findings.map((f) => ({
    ...f,
    previousFindingId: priorByKey.get(`${f.url}\0${f.category}\0${f.rule}`) ?? null,
  }));
}

/** Cap persisted HTML snapshots to bound worker RSS and Postgres row size. */
export const HTML_SNAPSHOT_MAX_BYTES = 512 * 1024;

export function truncateHtmlSnapshot(html: string, maxBytes = HTML_SNAPSHOT_MAX_BYTES): string {
  if (Buffer.byteLength(html, 'utf8') <= maxBytes) return html;
  // Slice by code units then back off to a valid UTF-8 boundary.
  let end = Math.min(html.length, maxBytes);
  while (end > 0 && Buffer.byteLength(html.slice(0, end), 'utf8') > maxBytes) end -= 1;
  return html.slice(0, end);
}

export function makePageAuditHandler(opts: { fetchText: FetchText }) {
  return async function handle(job: Job<PageAuditJobData>) {
    const { pageAuditId, auditId, projectPageId, url } = job.data;
    // The FlowProducer's parent group is enqueued on the `auditPage` queue
    // alongside the page children (audit-job.ts:97-103), but its data only
    // carries `{ auditId }` — no `pageAuditId`. The parent job is purely a
    // marker for `waitUntilFinished`; treat it as a no-op so the worker
    // doesn't crash on `findUnique({ where: { id: undefined } })`.
    if (!pageAuditId) return;
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

    const inflight = new Map<
      string,
      Promise<{ status: number; headers: Record<string, string>; text: string }>
    >();
    const fetchTextDedup: FetchText = (url, init) => {
      const key = fetchDedupKey(url, init);
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
      const pageScore = result.score as {
        overall: number;
        byCategory?: Record<string, number | null>;
      };
      const finishedAt = new Date();
      const newFindings = result.findings;
      const findingsData = await attachLineage(newFindings, pageAuditId, projectPageId);
      await prisma.$transaction([
        prisma.finding.createMany({
          data: findingsData.map((f) => ({
            auditId, // string in parented path; null in standalone path (destructured from job.data; nullable per F5.4-T1)
            pageAuditId,
            category: f.category,
            severity: f.severity,
            rule: f.rule,
            message: f.message,
            url: f.url,
            selector: f.selector ?? null,
            evidence: f.evidence as object,
            previousFindingId: f.previousFindingId,
          })),
        }),
        prisma.pageAudit.update({
          where: { id: pageAuditId },
          data: { status: 'completed', finishedAt, score: pageScore },
        }),
        prisma.projectPage.update({
          where: { id: projectPageId },
          data: { lastAuditedAt: finishedAt, htmlSnapshot: truncateHtmlSnapshot(htmlRes.text) },
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
