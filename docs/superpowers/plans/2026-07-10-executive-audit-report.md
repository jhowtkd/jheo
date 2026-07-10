# Executive Audit Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an executive audit report (LLM narrative + charts + HTML export) alongside the existing technical audit view, generated on first open of the Executivo tab and cached on `Audit.executiveReport`.

**Architecture:** `packages/core/src/reports/` builds deterministic `AuditSummary` aggregates from audit/findings/GSC data; a single LLM call produces validated `ExecutiveNarrative` JSON; `apps/api` caches the merged record and serves SPA + HTML export; `apps/web` adds Executivo|Técnico tabs on `/audits/:id`.

**Tech Stack:** TypeScript, Zod, Prisma, Fastify, Vitest, React, @tanstack/react-query, react-i18next, existing `LLMProvider` from `@jheo/core`.

**Spec:** `docs/superpowers/specs/2026-07-10-executive-audit-report-design.md`

## Global Constraints

- Every new UI string ships in **both** `apps/web/src/i18n/en.json` and `pt-BR.json` — run `pnpm --filter @jheo/web test src/i18n/parity.test.ts` after i18n edits.
- LLM output must pass Zod + `stripLlmThinking` (same pattern as `packages/core/src/suggestions/run-suggestion.ts`).
- Model env: `JHEO_REPORT_MODEL` → fallback `JHEO_SUGGESTION_MODEL` → `'gpt-4o-mini'`.
- No new chart npm dependencies — SVG/CSS only.
- Commands from repo root unless noted; web tests use paths relative to `apps/web`.

## File Structure

**Create (core):**
- `packages/core/src/reports/schema.ts` — `AuditSummary`, `ExecutiveNarrative`, Zod schemas
- `packages/core/src/reports/aggregate.ts` — `buildAuditSummary(...)`
- `packages/core/src/reports/prompts.ts` — `buildExecutiveReportPrompt(summary, locale)`
- `packages/core/src/reports/run-executive-report.ts` — `runExecutiveReport(provider, summary, locale)`
- `packages/core/src/reports/charts.ts` — pure SVG string builders
- `packages/core/src/reports/index.ts` — barrel
- `packages/core/test/reports/aggregate.test.ts`
- `packages/core/test/reports/run-executive-report.test.ts`

**Create (api):**
- `apps/api/src/services/executive-report.ts` — load/generate/cache orchestration
- `apps/api/src/services/executive-report-html.ts` — standalone HTML renderer
- `apps/api/src/services/gsc-report-summary.ts` — fold GSC DB rows into summary slice (28d)
- `apps/api/test/executive-report-routes.test.ts`

**Create (web):**
- `apps/web/src/components/reports/CategoryBarChart.tsx`
- `apps/web/src/components/reports/SeverityChart.tsx`
- `apps/web/src/pages/ExecutiveReportView.tsx`
- `apps/web/src/pages/__tests__/ExecutiveReportView.test.tsx`

**Modify:**
- `apps/api/prisma/schema.prisma` — `executiveReport Json?` on `Audit`
- `apps/api/src/routes/audits.ts` — register executive-report routes (or split plugin)
- `apps/api/src/server.ts` — pass `llmProviders` into audit/executive routes if extracted
- `packages/core/src/index.ts` — re-export reports module
- `apps/web/src/pages/AuditResults.tsx` — Executivo | Técnico tabs
- `apps/web/src/api.ts` — `getExecutiveReport`, `getExecutiveReportExport`
- `apps/web/src/i18n/en.json` + `pt-BR.json` — `audit.executive.*` keys
- `docker/.env.example` — document `JHEO_REPORT_MODEL` (optional)

---

## Phase P1 — Aggregates + schema + DB column

### Task 1: Report types and Zod schemas

**Files:**
- Create: `packages/core/src/reports/schema.ts`
- Create: `packages/core/src/reports/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `schema.ts`**

```ts
import { z } from 'zod';

export const SeverityCountsSchema = z.object({
  error: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
});

export const TopRuleSummarySchema = z.object({
  rule: z.string(),
  affectedPages: z.number().int().nonnegative(),
  maxSeverity: z.enum(['error', 'warning', 'info']),
  sampleMessage: z.string(),
  sortScore: z.number(),
});

export const GscReportSummarySchema = z.object({
  clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(),
  ctr: z.number().min(0).max(1),
  lowCtrQueryCount: z.number().int().nonnegative(),
  periodDays: z.number().int().positive(),
});

export const AuditSummarySchema = z.object({
  projectName: z.string(),
  rootUrl: z.string(),
  auditId: z.string(),
  finishedAt: z.string().nullable(),
  overall: z.number().int().min(0).max(100),
  byCategory: z.record(z.number().int().min(0).max(100).nullable()),
  pagesAudited: z.number().int().nonnegative(),
  pagesTotal: z.number().int().nonnegative(),
  pagesFailed: z.number().int().nonnegative(),
  severityCounts: SeverityCountsSchema,
  topRules: z.array(TopRuleSummarySchema).max(15),
  gsc: GscReportSummarySchema.optional(),
});

export const ExecutiveNarrativeSchema = z.object({
  executiveSummary: z.string().min(50).max(2000),
  topIssues: z.array(z.object({
    rule: z.string(),
    title: z.string(),
    businessImpact: z.string(),
    impactLevel: z.enum(['high', 'medium', 'low']),
    affectedPages: z.number().int().nonnegative(),
  })).min(1).max(15),
  scenarios: z.array(z.object({
    label: z.string(),
    estimatedScoreFrom: z.number().int().min(0).max(100),
    estimatedScoreTo: z.number().int().min(0).max(100),
    rationale: z.string(),
  })).min(1).max(5),
  recommendations: z.array(z.string()).min(1).max(8),
});

export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type ExecutiveNarrative = z.infer<typeof ExecutiveNarrativeSchema>;
export type ExecutiveReportRecord = {
  status: 'generating' | 'ready' | 'failed';
  locale: 'en' | 'pt-BR';
  generatedAt: string | null;
  model: string | null;
  errorMessage: string | null;
  aggregates: AuditSummary;
  narrative: ExecutiveNarrative | null;
};
```

- [ ] **Step 2: Barrel + core index export**

`packages/core/src/reports/index.ts`:
```ts
export * from './schema.js';
export { buildAuditSummary } from './aggregate.js';
export { buildExecutiveReportPrompt } from './prompts.js';
export { runExecutiveReport, ExecutiveReportLlmError } from './run-executive-report.js';
export { renderCategoryBarsSvg, renderSeverityDonutSvg } from './charts.js';
```

Add to `packages/core/src/index.ts`:
```ts
export {
  buildAuditSummary,
  buildExecutiveReportPrompt,
  runExecutiveReport,
  ExecutiveReportLlmError,
  AuditSummarySchema,
  ExecutiveNarrativeSchema,
  type AuditSummary,
  type ExecutiveNarrative,
  type ExecutiveReportRecord,
  renderCategoryBarsSvg,
  renderSeverityDonutSvg,
} from './reports/index.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/reports/schema.ts packages/core/src/reports/index.ts packages/core/src/index.ts
git commit -m "feat(core): add executive report schemas"
```

---

### Task 2: `buildAuditSummary` with tests

**Files:**
- Create: `packages/core/src/reports/aggregate.ts`
- Create: `packages/core/test/reports/aggregate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { buildAuditSummary } from '../../src/reports/aggregate.js';

const baseFinding = {
  category: 'seo' as const,
  severity: 'warning' as const,
  message: 'Meta description is missing',
  url: 'https://example.com/a',
  selector: null,
  evidence: {},
};

describe('buildAuditSummary', () => {
  it('tallies severity counts and groups top rules by distinct url', () => {
    const summary = buildAuditSummary({
      projectName: 'Acme',
      rootUrl: 'https://example.com/',
      auditId: 'a1',
      finishedAt: '2026-07-10T10:00:00.000Z',
      score: {
        overall: 88,
        byCategory: { seo: 90, cwv: null, geo: 85, a11y: 80, content: 88 },
        pagesAudited: 10,
        pagesTotal: 12,
      },
      pagesFailed: 2,
      findings: [
        { ...baseFinding, rule: 'meta.missing-description', url: 'https://example.com/1' },
        { ...baseFinding, rule: 'meta.missing-description', url: 'https://example.com/2' },
        { ...baseFinding, rule: 'meta.missing-description', url: 'https://example.com/1' },
        { ...baseFinding, rule: 'images.missing-alt', severity: 'error', url: 'https://example.com/3' },
      ],
    });
    expect(summary.severityCounts).toEqual({ error: 1, warning: 2, info: 0 });
    expect(summary.topRules[0]?.rule).toBe('meta.missing-description');
    expect(summary.topRules[0]?.affectedPages).toBe(2);
    expect(summary.overall).toBe(88);
  });

  it('includes optional gsc slice when provided', () => {
    const summary = buildAuditSummary({
      projectName: 'Acme',
      rootUrl: 'https://example.com/',
      auditId: 'a1',
      finishedAt: null,
      score: { overall: 70, byCategory: {}, pagesAudited: 5, pagesTotal: 5 },
      pagesFailed: 0,
      findings: [],
      gsc: { clicks: 4200, impressions: 100000, ctr: 0.042, lowCtrQueryCount: 18, periodDays: 28 },
    });
    expect(summary.gsc?.clicks).toBe(4200);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @jheo/core test test/reports/aggregate.test.ts`
Expected: FAIL — cannot find module `aggregate.js`

- [ ] **Step 3: Implement `aggregate.ts`**

```ts
import type { AuditSummary, TopRuleSummary } from './schema.js';

type FindingInput = {
  rule: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  url: string;
};

const SEV_SORT = { error: 3, warning: 2, info: 1 } as const;

export function buildAuditSummary(input: {
  projectName: string;
  rootUrl: string;
  auditId: string;
  finishedAt: string | null;
  score: {
    overall: number;
    byCategory: Record<string, number | null>;
    pagesAudited?: number;
    pagesTotal?: number;
  };
  pagesFailed: number;
  findings: FindingInput[];
  gsc?: AuditSummary['gsc'];
}): AuditSummary {
  const severityCounts = { error: 0, warning: 0, info: 0 };
  const byRule = new Map<string, { urls: Set<string>; maxSeverity: FindingInput['severity']; sampleMessage: string }>();

  for (const f of input.findings) {
    severityCounts[f.severity]++;
    const entry = byRule.get(f.rule) ?? { urls: new Set(), maxSeverity: f.severity, sampleMessage: f.message };
    entry.urls.add(f.url);
    if (SEV_SORT[f.severity] > SEV_SORT[entry.maxSeverity]) entry.maxSeverity = f.severity;
    byRule.set(f.rule, entry);
  }

  const topRules: TopRuleSummary[] = [...byRule.entries()]
    .map(([rule, v]) => ({
      rule,
      affectedPages: v.urls.size,
      maxSeverity: v.maxSeverity,
      sampleMessage: v.sampleMessage.slice(0, 120),
      sortScore: SEV_SORT[v.maxSeverity] * v.urls.size,
    }))
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 15);

  return {
    projectName: input.projectName,
    rootUrl: input.rootUrl,
    auditId: input.auditId,
    finishedAt: input.finishedAt,
    overall: input.score.overall,
    byCategory: input.score.byCategory,
    pagesAudited: input.score.pagesAudited ?? 0,
    pagesTotal: input.score.pagesTotal ?? 0,
    pagesFailed: input.pagesFailed,
    severityCounts,
    topRules,
    ...(input.gsc ? { gsc: input.gsc } : {}),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @jheo/core test test/reports/aggregate.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reports/aggregate.ts packages/core/test/reports/aggregate.test.ts
git commit -m "feat(core): build audit summary aggregates for executive report"
```

---

### Task 3: Prisma `executiveReport` column

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `pnpm --filter @jheo/api exec prisma migrate dev`

- [ ] **Step 1: Add field to `Audit` model**

```prisma
  executiveReport Json?
```

- [ ] **Step 2: Create migration**

Run from repo root:
```bash
pnpm --filter @jheo/api exec prisma migrate dev --name add_audit_executive_report
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(api): add Audit.executiveReport json column"
```

---

### Task 4: GSC summary helper for reports

**Files:**
- Create: `apps/api/src/services/gsc-report-summary.ts`
- Create: `apps/api/test/gsc-report-summary.test.ts`

- [ ] **Step 1: Write test with mocked prisma groupBy**

Test that `buildGscReportSummary(prisma, projectId)` returns totals + lowCtrQueryCount when connection `syncStatus === 'ok'`, else `undefined`.

- [ ] **Step 2: Implement** — query last 28 days `gscSnapshot`, sum clicks/impressions, count queries where `ctr < 0.02` and impressions > 100.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): gsc rollup for executive report summary"
```

---

## Phase P2 — LLM pipeline + API routes

### Task 5: Executive report prompt + LLM runner

**Files:**
- Create: `packages/core/src/reports/prompts.ts`
- Create: `packages/core/src/reports/run-executive-report.ts`
- Create: `packages/core/test/reports/run-executive-report.test.ts`

- [ ] **Step 1: Write failing test with fake `LLMProvider`**

Mock provider returns valid JSON matching `ExecutiveNarrativeSchema`. Assert `runExecutiveReport` strips think blocks and returns parsed narrative.

- [ ] **Step 2: Implement `prompts.ts`**

Locale-specific system instructions (pt-BR vs en); user message = `JSON.stringify(summary)`; demand JSON-only output matching schema fields from spec §6.3.

- [ ] **Step 3: Implement `run-executive-report.ts`**

Mirror `run-suggestion.ts`: `stripLlmThinking`, fence strip, brace extraction, Zod parse, one retry with corrective suffix, export `ExecutiveReportLlmError` on failure. Model from `process.env.JHEO_REPORT_MODEL ?? process.env.JHEO_SUGGESTION_MODEL ?? 'gpt-4o-mini'`. Timeout 60_000ms.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @jheo/core test test/reports/`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): LLM executive report generation"
```

---

### Task 6: `executive-report` service (cache + generation lock)

**Files:**
- Create: `apps/api/src/services/executive-report.ts`

- [ ] **Step 1: Implement `loadOrGenerateExecutiveReport(deps, auditId, locale)`**

Deps: `{ prisma, llmProviders, fetchFn }`.

Logic:
1. Load audit + project + findings; 404 if missing; 409 if `status !== 'completed'`.
2. Read `executiveReport` JSON; if `ready` and `locale` matches → return.
3. If `generating` → return `{ status: 'generating' }`.
4. Build aggregates via `buildAuditSummary` + optional `buildGscReportSummary`.
5. Atomically set `executiveReport = { status: 'generating', locale, aggregates, ... }` only if not already generating.
6. Call `runExecutiveReport`; on success set `ready` + `narrative` + `generatedAt` + `model`; on failure set `failed` + `errorMessage` but keep `aggregates`.
7. Sanitize narrative: clamp `estimatedScoreFrom` to `aggregates.overall`; drop `topIssues` whose `rule` not in `topRules`.

- [ ] **Step 2: Unit test service with vi.mocked prisma + fake LLM** in `apps/api/test/executive-report-service.test.ts` (no DB required).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): executive report generation service with cache"
```

---

### Task 7: API routes

**Files:**
- Modify: `apps/api/src/routes/audits.ts` OR create `apps/api/src/routes/executive-report.ts`
- Modify: `apps/api/src/server.ts` (if new plugin needs `llmProviders`)
- Create: `apps/api/test/executive-report-routes.test.ts`

- [ ] **Step 1: Add routes**

`GET /api/audits/:id/executive-report`:
- Uses `req.locale` as `'en' | 'pt-BR'`
- 200 ready / 202 generating / 200 failed
- Rate limit: 10/min (match suggestions pattern)

`GET /api/audits/:id/executive-report/export`:
- 409 if not `ready`
- Returns HTML from `renderExecutiveReportHtml(record)`

Optional: `?force=1` on GET to invalidate cache and regenerate (for retry button).

- [ ] **Step 2: Route tests** (mock service or DB-backed like `audits.test.ts`)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): executive report and export routes"
```

---

## Phase P3 — Web UI + HTML export + i18n

### Task 8: SVG chart helpers (shared)

**Files:**
- Create: `packages/core/src/reports/charts.ts`
- Create: `packages/core/test/reports/charts.test.ts`

- [ ] **Step 1: `renderCategoryBarsSvg(byCategory, labels)`** — returns `<svg>` string, width 400, bars for seo/cwv/geo/a11y/content.

- [ ] **Step 2: `renderSeverityDonutSvg(counts)`** — conic-gradient or arc paths for error/warning/info.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(core): svg chart helpers for executive report"
```

---

### Task 9: HTML export renderer

**Files:**
- Create: `apps/api/src/services/executive-report-html.ts`
- Create: `apps/api/test/executive-report-html.test.ts`

- [ ] **Step 1: `renderExecutiveReportHtml(record: ExecutiveReportRecord)`**

Full `<!DOCTYPE html>` with embedded CSS (print-friendly), sections mirroring spec §9.3, embed SVG from chart helpers, include narrative text, footer with audit id + date. No external JS/CDN.

- [ ] **Step 2: Test** — snapshot or assert contains `executiveSummary` text and `<svg`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): standalone HTML export for executive report"
```

---

### Task 10: i18n keys

**Files:**
- Modify: `apps/web/src/i18n/en.json`
- Modify: `apps/web/src/i18n/pt-BR.json`

- [ ] **Step 1: Add `audit.executive` block**

Keys (minimum):
- `tabExecutive`, `tabTechnical`
- `generating`, `failed`, `retry`
- `sections.summary`, `sections.scores`, `sections.severity`, `sections.topIssues`, `sections.gsc`, `sections.scenarios`, `sections.recommendations`
- `exportHtml`, `impactHigh`, `impactMedium`, `impactLow`
- `gscEmpty` (connect CTA copy)

- [ ] **Step 2: Run parity test**

Run: `pnpm --filter @jheo/web test src/i18n/parity.test.ts`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(i18n): executive audit report strings"
```

---

### Task 11: API client

**Files:**
- Modify: `apps/web/src/api.ts`

- [ ] **Step 1: Add types + functions**

```ts
export type ExecutiveReportResponse = {
  status: 'generating' | 'ready' | 'failed';
  locale: string;
  generatedAt: string | null;
  aggregates: AuditSummary; // import type from @jheo/core or duplicate slim type
  narrative: ExecutiveNarrative | null;
  errorMessage?: string | null;
};

export async function getExecutiveReport(auditId: string): Promise<ExecutiveReportResponse> {
  const r = await localeFetch(`${API}/audits/${auditId}/executive-report`);
  if (r.status === 202) return r.json();
  if (!r.ok) throw new Error(`Failed to load executive report: ${r.status}`);
  return r.json();
}

export function executiveReportExportUrl(auditId: string): string {
  return `${API}/audits/${auditId}/executive-report/export`;
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(web): api client for executive report"
```

---

### Task 12: Chart components + ExecutiveReportView

**Files:**
- Create: `apps/web/src/components/reports/CategoryBarChart.tsx`
- Create: `apps/web/src/components/reports/SeverityChart.tsx`
- Create: `apps/web/src/pages/ExecutiveReportView.tsx`
- Create: `apps/web/src/pages/__tests__/ExecutiveReportView.test.tsx`

- [ ] **Step 1: Chart components** — React versions matching core SVG layout (can use same math inline or `dangerouslySetInnerHTML` for SVG string).

- [ ] **Step 2: `ExecutiveReportView`**

Props: `{ auditId: string }`.
- `useQuery` with `refetchInterval: (q) => q.state.data?.status === 'generating' ? 2000 : false`
- Render sections per spec §9.2
- Export button: `<a href={executiveReportExportUrl(auditId)} download>` (or fetch blob if CORS requires)
- Link to `/fixes?auditId=...`

- [ ] **Step 3: Test** — fixture `ready` payload renders summary + scenario labels; `generating` shows spinner message.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): executive report view with charts"
```

---

### Task 13: AuditResults tabs

**Files:**
- Modify: `apps/web/src/pages/AuditResults.tsx`

- [ ] **Step 1: Add tab state** — `'executive' | 'technical'`, default `executive` when `status === 'completed'`, else `technical` only.

- [ ] **Step 2: Tab UI** — simple button group or underline tabs above content.

- [ ] **Step 3: Render**

```tsx
{tab === 'executive' && audit.status === 'completed' && (
  <ExecutiveReportView auditId={audit.id} />
)}
{tab === 'technical' && (
  /* existing score + findings */
)}
```

- [ ] **Step 4: Manual smoke** — open completed audit, Executivo loads, Técnico unchanged.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): executive and technical tabs on audit results"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run full test suites**

```bash
pnpm --filter @jheo/core test
pnpm --filter @jheo/api test
pnpm --filter @jheo/web test
pnpm run typecheck
```

- [ ] **Step 2: Docker smoke (optional)**

Rebuild API, open `/audits/:id` on a completed audit, confirm Executivo generates, export downloads `.html`.

- [ ] **Step 3: Update spec status** — already Approved.

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: executive report integration fixes"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Executivo + Técnico tabs | Task 13 |
| First-view LLM generation + cache | Task 6, 7 |
| Aggregates (scores, severity, top rules) | Task 2 |
| GSC section when connected | Task 4, 12 |
| LLM narrative JSON schema | Task 1, 5 |
| HTML export | Task 9, 7 |
| i18n pt-BR/en | Task 10 |
| No chart library | Task 8, 12 |
| Trend vs previous audit deferred | — (v2) |
| PDF deferred | — |

## Placeholder Scan

No TBD/TODO steps. Each task names concrete files and commands.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-executive-audit-report.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
