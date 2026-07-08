import type { Job } from 'bullmq';
import { FlowProducer, QueueEvents } from 'bullmq';
import {
  auditOrchestrator,
  auditPageQueue,
  type AuditJobData,
  type PageAuditJobData,
} from '../queue.js';
import { prisma } from '../db.js';
import { discoverSite } from '../site-discovery.js';
import { buildGscSnapshotContext } from '../gsc-snapshot-context.js';
import { fetchDedupKey } from '../fetch-dedup-key.js';

export type FetchText = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ status: number; headers: Record<string, string>; text: string }>;

// Lazy-initialised FlowProducer. The QueueEvents used by the flow
// orchestrator is *not* a module-level singleton — see withAuditPageQueueEvents
// below for the rationale (each audit gets its own QueueEvents so a pub/sub
// failure in one audit cannot leak state into the next).
const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
let _flowProducer: FlowProducer | undefined;
function getFlowProducer(): FlowProducer {
  if (!_flowProducer) {
    _flowProducer = new FlowProducer({
      connection: { host: REDIS_HOST, port: REDIS_PORT },
    });
  }
  return _flowProducer;
}

/**
 * Run `fn` with a fresh QueueEvents for the `auditPage` queue, guaranteeing
 * the underlying ioredis pub/sub connection is closed when the callback
 * resolves or throws. This is the lifecycle used by `runFlowOrchestrator`.
 *
 * Why per-call instead of a module-level singleton:
 *   - The previous singleton (`getAuditPageQueueEvents()`) created one
 *     QueueEvents per process and never recreated it. ioredis pub/sub
 *     subscriptions can drop silently under burst load (e.g. 500 children
 *     completing in quick succession), and the default
 *     `maxRetriesPerRequest=20` lets the client give up reconnecting
 *     permanently. A stale singleton then causes `waitUntilFinished` to
 *     hang for the full 30-minute timeout, leaving the parent audit job
 *     stuck in `running` even though every child has finished.
 *   - Scoping the QueueEvents to a single audit means each one starts with
 *     a clean ioredis client and pub/sub subscription, and any transient
 *     blip is naturally contained — the next audit retries from scratch
 *     with a fresh subscriber. The connection-count cost is one extra
 *     pub/sub socket per audit (closed in `finally`), not per page.
 *
 * Connection options match the main worker (`queue.ts`): infinite retry on
 * transient errors, no offline command queueing, 10s connect timeout. The
 * pub/sub subscription is the long-lived thing here — ioredis must keep
 * trying to reconnect, not give up after 20 failed commands.
 */
export async function withAuditPageQueueEvents<T>(
  fn: (queueEvents: QueueEvents) => Promise<T>,
): Promise<T> {
  const queueEvents = new QueueEvents('auditPage', {
    connection: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 10_000,
    },
  });
  try {
    return await fn(queueEvents);
  } finally {
    // `close()` may itself reject if the underlying socket is already gone
    // (the typical failure mode we're guarding against). Swallow — the
    // process exit / next audit's fresh subscriber is the real recovery.
    await queueEvents.close().catch(() => {});
  }
}

/**
 * Close the lazily-created FlowProducer (and clear the singleton) so
 * the SIGTERM shutdown path can drain its Redis connection without
 * trying to use a module-internal handle. No-op if the producer was
 * never instantiated in this process (e.g. unit tests, or `polling`
 * orchestrator only).
 */
export async function closeFlowProducer(): Promise<void> {
  if (!_flowProducer) return;
  const fp = _flowProducer;
  _flowProducer = undefined;
  await fp.close();
}

/**
 * Flow Producer orchestrator — fans out one `auditPage` child job per page,
 * then blocks on the parent group's `waitUntilFinished` so the audit handler
 * only resolves once every child has completed (or the 30-minute deadline
 * elapses).
 */
async function runFlowOrchestrator(
  auditId: string,
  pages: Array<{ id: string; url: string }>,
): Promise<void> {
  // Look up the PageAudit rows we just created (status='queued') to get
  // their IDs. The children need `pageAuditId` so the worker can stamp
  // findings and update the row when it finishes.
  const pageAudits = await prisma.pageAudit.findMany({
    where: { auditId, status: 'queued' },
    orderBy: { id: 'asc' },
  });
  const pageAuditIdByProjectPageId = new Map(
    pageAudits.map((pa) => [pa.projectPageId, pa.id]),
  );

  const children = pages.map((page) => {
    const pageAuditId = pageAuditIdByProjectPageId.get(page.id);
    if (!pageAuditId) {
      throw new Error(
        `PageAudit not found for projectPageId ${page.id}`,
      );
    }
    return {
      name: 'page',
      queueName: 'auditPage',
      data: {
        pageAuditId,
        auditId,
        projectPageId: page.id,
        url: page.url,
      } satisfies PageAuditJobData,
    };
  });

  const group = await getFlowProducer().add({
    name: 'audit-group',
    queueName: 'auditPage',
    data: { auditId },
    children,
  });
  // The QueueEvents is scoped to this audit via withAuditPageQueueEvents;
  // it will be closed (and its pub/sub subscription torn down) when the
  // callback resolves, the waitUntilFinished timeout fires, or the parent
  // handler throws. See the helper's docstring for why we do not keep a
  // module-level singleton.
  await withAuditPageQueueEvents((queueEvents) =>
    group.job.waitUntilFinished(queueEvents, 30 * 60 * 1000),
  );
}

/**
 * Polling orchestrator — manually enqueues one `auditPage` job per page,
 * then polls the `PageAudit` table until every page is terminal or the
 * 30-minute deadline elapses. Used when the runtime is configured with
 * `JHEO_AUDIT_ORCHESTRATOR=polling`.
 */
async function runPollingOrchestrator(
  auditId: string,
  pages: Array<{ id: string; url: string }>,
): Promise<void> {
  for (const page of pages) {
    const pa = await prisma.pageAudit.findFirst({
      where: { auditId, projectPageId: page.id },
    });
    if (!pa) continue;
    await auditPageQueue.add('page', {
      pageAuditId: pa.id,
      auditId,
      projectPageId: page.id,
      url: page.url,
    } satisfies PageAuditJobData);
  }
  // Poll until all PageAudits are terminal or 30 min
  const deadline = Date.now() + 30 * 60 * 1000;
  const total = pages.length;
  while (Date.now() < deadline) {
    const done = await prisma.pageAudit.count({
      where: {
        auditId,
        status: { in: ['completed', 'failed', 'skipped'] },
      },
    });
    if (done >= total) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

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
        const key = fetchDedupKey(url, init);
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
        : (project.maxPages > 0 ? project.maxPages : 0);
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

      // discoverSite yields raw { url, discoveredVia } records, not DB rows.
      // ProjectPage has @@unique([projectId, url]) and createMany + skipDuplicates
      // means persisted rows may pre-date this audit; resolve ids in one query so
      // the per-page loop can stamp PageAudit rows correctly.
      const persistedPages = await prisma.projectPage.findMany({
        where: { projectId: project.id, url: { in: pages.map((p) => p.url) } },
        select: { id: true, url: true },
      });
      const projectPageIdByUrl = new Map(persistedPages.map((p) => [p.url, p.id]));

      const pagesToRun = maxPages > 0 ? pages.slice(0, maxPages) : pages;
      const pagesWithIds = pagesToRun
        .map((page) => {
          const projectPageId = projectPageIdByUrl.get(page.url);
          return projectPageId ? { id: projectPageId, url: page.url } : null;
        })
        .filter((p): p is { id: string; url: string } => p !== null);

      // Create the PageAudit rows (one per page, status='queued').
      // The pages were already inserted by projectPage.createMany above
      // and each has an id we can reference.
      await prisma.pageAudit.createMany({
        data: pagesWithIds.map((page) => ({
          auditId: audit.id,
          projectPageId: page.id,
          status: 'queued',
        })),
        skipDuplicates: true,
      });

      if (auditOrchestrator === 'polling') {
        await runPollingOrchestrator(audit.id, pagesWithIds);
      } else {
        await runFlowOrchestrator(audit.id, pagesWithIds);
      }

      // Aggregate score from PageAudits.
      const pageAudits = await prisma.pageAudit.findMany({
        where: { auditId: audit.id, status: 'completed' },
        select: { score: true },
      });
      const pageScores = pageAudits
        .map((p) => p.score as { overall: number; byCategory?: Record<string, number | null> } | null)
        .filter((s): s is { overall: number; byCategory?: Record<string, number | null> } => s !== null);

      const categories = ['seo', 'cwv', 'geo', 'a11y', 'content'] as const;
      const byCategory = Object.fromEntries(
        categories.map((category) => {
          const values = pageScores
            .map((s) => s.byCategory?.[category])
            .filter((v): v is number => v !== null && v !== undefined);
          return [category, values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null];
        }),
      );
      const score = {
        overall: pageScores.length
          ? Math.round(pageScores.reduce((sum, s) => sum + s.overall, 0) / pageScores.length)
          : 0,
        byCategory,
        pagesAudited: pageAudits.length,
        pagesTotal: pagesWithIds.length,
        discoveryLimitReached: pagesWithIds.length === pages.length, // approximation; can be refined
      };
      const finishedAt = new Date();

      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'completed', finishedAt, score },
      });
    } catch (err) {
      // Conditional update — only mark 'failed' if the audit is still
      // 'running'. If a manual intervention (e.g. a SQL `UPDATE` from an
      // operator, or another worker's retry) already moved it to a
      // terminal state during this in-flight run, `updateMany` matches
      // zero rows and we preserve the human-set outcome instead of
      // clobbering 'completed' with 'failed'.
      //
      // Background: 2026-07-08 cenbrap audit got stuck in
      // `waitUntilFinished`. Operator manually set status='completed'
      // via SQL with the computed score. The 30-minute timeout then
      // fired, the catch block ran, and an unconditional
      // `prisma.audit.update` overwrote the manual 'completed' with
      // 'failed'. This conditional update is the fix.
      await prisma.audit.updateMany({
        where: { id: audit.id, status: 'running' },
        data: { status: 'failed', finishedAt: new Date() },
      });
      throw err;
    }
  };
}

