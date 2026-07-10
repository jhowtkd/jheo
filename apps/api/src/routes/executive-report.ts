import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import type { ExecutiveReportRecord } from '@jheo/core';
import {
  loadOrGenerateExecutiveReport,
  ExecutiveReportNotFoundError,
  ExecutiveReportNotCompletedError,
  type ExecutiveReportDeps,
} from '../services/executive-report.js';
import { renderExecutiveReportHtml } from '../services/executive-report-html.js';

export const executiveReportRoutes: FastifyPluginAsync<ExecutiveReportDeps> = async (
  app: FastifyInstance,
  deps,
) => {
  app.get<{ Params: { id: string }; Querystring: { force?: string } }>(
    '/api/audits/:id/executive-report',
    { config: { rateLimit: { max: 10, windowMs: 60_000 } } },
    async (req, reply) => {
      const locale = (req.locale ?? 'en') as 'en' | 'pt-BR';
      const auditId = req.params.id;

      if (req.query.force === '1') {
        await deps.prisma.audit
          .update({ where: { id: auditId }, data: { executiveReport: Prisma.JsonNull } })
          .catch(() => {});
      }

      let record: ExecutiveReportRecord;
      try {
        record = await loadOrGenerateExecutiveReport(deps, auditId, locale);
      } catch (e) {
        if (e instanceof ExecutiveReportNotFoundError) {
          return reply.code(404).send({ error: 'AUDIT_NOT_FOUND' });
        }
        if (e instanceof ExecutiveReportNotCompletedError) {
          return reply.code(409).send({ error: 'AUDIT_NOT_COMPLETED', status: e.status });
        }
        throw e;
      }

      if (record.status === 'generating') return reply.code(202).send(record);
      return reply.send(record);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/audits/:id/executive-report/export',
    { config: { rateLimit: { max: 10, windowMs: 60_000 } } },
    async (req, reply) => {
      const locale = (req.locale ?? 'en') as 'en' | 'pt-BR';

      let record: ExecutiveReportRecord;
      try {
        record = await loadOrGenerateExecutiveReport(deps, req.params.id, locale);
      } catch (e) {
        if (e instanceof ExecutiveReportNotFoundError) {
          return reply.code(404).send({ error: 'AUDIT_NOT_FOUND' });
        }
        if (e instanceof ExecutiveReportNotCompletedError) {
          return reply.code(409).send({ error: 'AUDIT_NOT_COMPLETED', status: e.status });
        }
        throw e;
      }

      if (record.status !== 'ready') {
        return reply.code(409).send({ error: 'REPORT_NOT_READY', status: record.status });
      }

      reply.header('content-type', 'text/html; charset=utf-8');
      return reply.send(renderExecutiveReportHtml(record));
    },
  );
};
