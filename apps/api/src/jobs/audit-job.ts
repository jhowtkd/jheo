import type { Job } from 'bullmq';
import { runAudit } from '@jheo/core';
import type { AuditJobData } from '../queue.js';
import { prisma } from '../db.js';

export function makeAuditHandler(opts: {
  fetchText: (url: string) => Promise<{ status: number; headers: Record<string, string>; text: string }>;
}) {
  return async function handle(job: Job<AuditJobData>) {
    const audit = await prisma.audit.findUnique({ where: { id: job.data.auditId } });
    if (!audit) return;
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
      const ctx = {
        url: project.rootUrl,
        html: htmlRes.text,
        async fetchText(url: string) {
          return opts.fetchText(url);
        },
        log() {},
      };
      const result = await runAudit(ctx);
      await prisma.$transaction([
        ...result.findings.map((f) =>
          prisma.finding.create({
            data: {
              auditId: audit.id,
              category: f.category,
              severity: f.severity,
              rule: f.rule,
              message: f.message,
              url: f.url,
              selector: f.selector ?? null,
              evidence: f.evidence as object,
            },
          }),
        ),
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
