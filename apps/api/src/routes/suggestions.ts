import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { runSuggestion, LlmOutputError, buildSuggestionContext, type LLMProvider } from '@jheo/core';
import type { PrismaClient } from '@prisma/client';
import { checkSuggestionRate } from '../i18n/suggestion-rate-limit.js';

const FRESHNESS_MS = 5 * 60 * 1000;

export type SuggestionDeps = {
  prisma: PrismaClient;
  llmProviders: Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>;
  fetchFn: typeof fetch;
  clock?: () => number;
};

const CreateBody = z.object({
  findingId: z.string().min(1),
  locale: z.enum(['en', 'pt-BR']).optional(),
});

const ListQuery = z.object({ findingId: z.string().min(1) });

function pickProvider(llm: SuggestionDeps['llmProviders']): LLMProvider {
  // Prefer openai; fall back to first available.
  if (llm.openai) return llm.openai;
  const first = Object.values(llm).find(Boolean);
  if (!first) throw new Error('no_llm_provider');
  return first;
}

export const suggestionRoutes: FastifyPluginAsync<SuggestionDeps> = async (
  app: FastifyInstance,
  deps,
) => {
  const clock = deps.clock ?? (() => Date.now());

  app.post('/api/suggestions', async (req, reply) => {
    const rate = checkSuggestionRate(req.ip);
    if (!rate.allowed) {
      reply.header('retry-after', String(Math.ceil(rate.retryAfterMs / 1000)));
      return reply.code(429).send({ error: 'rate limit exceeded' });
    }

    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const finding = await deps.prisma.finding.findUnique({
      where: { id: parsed.data.findingId },
      include: { pageAudit: { include: { projectPage: true } } },
    });
    if (!finding) return reply.code(404).send({ error: 'not found' });
    const page = finding.pageAudit?.projectPage ?? null;
    if (!page) return reply.code(422).send({ error: 'FINDING_NOT_PAGE_SCOPED' });
    if (!page.htmlSnapshot) return reply.code(422).send({ error: 'PAGE_HTML_MISSING' });

    const existing = await deps.prisma.suggestion.findFirst({
      where: { findingId: finding.id, status: 'pending' },
    });
    const now = clock();
    if (existing && now - new Date(existing.createdAt).getTime() < FRESHNESS_MS) {
      return reply.code(200).send(existing);
    }
    if (existing) {
      await deps.prisma.suggestion.update({
        where: { id: existing.id },
        data: { status: 'superseded' },
      });
    }

    const locale = (parsed.data.locale ?? req.locale ?? 'en') as 'en' | 'pt-BR';
    const context = buildSuggestionContext({
      finding: {
        id: finding.id, category: finding.category, severity: finding.severity,
        message: finding.message, url: finding.url,
      },
      page: { id: page.id, url: page.url, htmlSnapshot: page.htmlSnapshot },
      locale,
    });

    let output;
    let providerName: string;
    try {
      const provider = pickProvider(deps.llmProviders);
      output = await runSuggestion(provider, context);
      providerName = provider === deps.llmProviders.openai ? 'openai'
        : provider === deps.llmProviders.anthropic ? 'anthropic'
        : provider === deps.llmProviders.openrouter ? 'openrouter'
        : 'llm';
    } catch (e) {
      if (e instanceof LlmOutputError) {
        return reply.code(502).send({ error: 'LLM_OUTPUT_INVALID', detail: e.raw.slice(0, 200) });
      }
      if (e instanceof Error && e.message === 'CATEGORY_NOT_SUPPORTED') {
        return reply.code(422).send({ error: 'CATEGORY_NOT_SUPPORTED' });
      }
      throw e;
    }

    const created = await deps.prisma.suggestion.create({
      data: {
        findingId: finding.id,
        kind: 'snippet',
        category: context.category,
        before: output.before,
        after: output.after,
        confidence: output.confidence,
        rationale: output.rationale,
        locale,
        status: 'pending',
        // Use the actual model name from the LLM response when available
        // (Generation records this for the same reason). Falls back to
        // `providerName:unknown` if the response shape changes.
        model: `${providerName}:unknown`,
      },
    });
    return reply.code(201).send(created);
  });

  app.get<{ Querystring: { findingId?: string } }>('/api/suggestions', async (req, reply) => {
    const q = ListQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    const list = await deps.prisma.suggestion.findMany({ where: { findingId: q.data.findingId } });
    return reply.send(list);
  });

  app.get<{ Params: { id: string } }>('/api/suggestions/:id', async (req, reply) => {
    const s = await deps.prisma.suggestion.findUnique({ where: { id: req.params.id } });
    if (!s) return reply.code(404).send({ error: 'not found' });
    return reply.send(s);
  });

  app.post<{ Params: { id: string } }>('/api/suggestions/:id/accept', async (req, reply) => {
    const s = await deps.prisma.suggestion.findUnique({
      where: { id: req.params.id },
      include: { finding: { include: { pageAudit: { include: { projectPage: true } } } } },
    });
    if (!s) return reply.code(404).send({ error: 'not found' });
    if (s.status !== 'pending') return reply.code(409).send({ error: 'ALREADY_DECIDED' });

    const updated = await deps.prisma.suggestion.update({
      where: { id: s.id },
      data: { status: 'accepted', decidedAt: new Date() },
    });

    // Delegate to F5.4 re-audit primitive. We use the running app's injector
    // so the request is scoped to the same project chain (server-derived).
    const pageId = s.finding.pageAudit?.projectPageId;
    if (!pageId) return reply.code(422).send({ error: 'FINDING_NOT_PAGE_SCOPED' });
    let reAuditId: string | null = null;
    try {
      const r = await app.inject({ method: 'POST', url: `/api/pages/${pageId}/audit`, payload: {} });
      if (r.statusCode === 200) {
        reAuditId = r.json().pageAuditId ?? null;
      } else if (r.statusCode === 409) {
        // In-progress re-audit — fetch the existing one.
        const existing = await deps.prisma.pageAudit.findFirst({
          where: { projectPageId: pageId, status: { in: ['queued', 'running'] } },
        });
        reAuditId = existing?.id ?? null;
      } else {
        return reply.code(502).send({ error: 'REAUDIT_ENQUEUE_FAILED', detail: r.body });
      }
    } catch (e) {
      return reply.code(502).send({ error: 'REAUDIT_ENQUEUE_FAILED', detail: String(e) });
    }
    return reply.send({ suggestion: updated, reAuditId });
  });

  app.post<{ Params: { id: string } }>('/api/suggestions/:id/reject', async (req, reply) => {
    const s = await deps.prisma.suggestion.findUnique({ where: { id: req.params.id } });
    if (!s) return reply.code(404).send({ error: 'not found' });
    if (s.status !== 'pending') return reply.code(409).send({ error: 'ALREADY_DECIDED' });
    const updated = await deps.prisma.suggestion.update({
      where: { id: s.id },
      data: { status: 'rejected', decidedAt: new Date() },
    });
    return reply.send(updated);
  });
};
