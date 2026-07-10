# Executive Audit Report — Design

**Date:** 2026-07-10  
**Status:** Approved (2026-07-10)  
**Milestone:** F8 (Reports)  
**Author:** jhowtkd  
**Predecessor:** F1 (audit + findings), F6 (i18n), GSC integration (shipped, panel unused), `/reports` index (shipped)

---

## 1. Problem

JHEO today produces **technical** audit output: numeric scores, severity counts,
and a long list of findings grouped by category (`/audits/:id`). Operators can
act on findings via Correções (F7), but there is no layer that answers questions
a stakeholder asks:

- What does this mean for our business?
- Which problems matter most?
- If we fix the top issues, how much better could we get?
- Can I share something that is not the raw audit UI?

The `/reports` index lists completed audits but only links to the technical view.
The original F1 spec mentioned JSON/Markdown export; the UX program deferred
exportable reports. Stakeholders (especially pt-BR readers) need a **comprehensible
executive report** with impacts, improvement estimates, and charts — plus a path
to export a self-contained HTML file.

---

## 2. Goals

- **`/audits/:id`** exposes two tabs: **Executivo** and **Técnico**.
  - **Técnico** preserves today's `AuditResults` experience (score card,
    severity summary, `FindingList`).
  - **Executivo** presents a stakeholder-oriented report: executive summary,
    charts, top issues by impact, optional GSC context, and improvement scenarios.
- On **first open** of the Executivo tab for a completed audit, the API
  generates LLM narrative content if not cached, then serves cached results on
  subsequent loads.
- **Export HTML**: one click downloads a self-contained `.html` file (inline
  CSS + SVG charts + LLM copy) suitable for e-mail or offline reading.
- **Locale**: executive copy follows `Accept-Language` (`pt-BR` or `en`), same
  as F6/F7.
- Reuse existing data: `Audit.score`, `Finding` rows, optional GSC snapshots.
  No new audit rules in this milestone.

---

## 3. Non-Goals (v1)

- PDF generation server-side (browser print-to-PDF is acceptable later).
- **Trend vs previous audit** (score delta, regression/improvement counts) —
  deferred to v2; diff data exists on re-audit but is not in scope here.
- Proactive generation at audit completion (only on first Executivo view).
- Replacing the technical findings list or Correções workflow.
- New charting library dependency (use SVG/CSS only).
- Post-translating LLM output via `/api/translate` if the model returns the
  wrong locale (show as-is + retry; polish in a follow-up).
- Public unauthenticated share links (export file only; SPA remains as today).

---

## 4. Decisions (brainstorm outcomes)

| Topic | Choice |
|-------|--------|
| Audience | Both: executive view for stakeholders + technical tab for operators |
| Executive sections (v1) | Score by area, severity distribution, top issues by impact, GSC (if connected), improvement scenarios |
| Impact & estimates | LLM-generated business language (inputs are deterministic aggregates) |
| Export | Self-contained HTML download |
| LLM trigger | Auto on first Executivo tab view; cache in DB |

---

## 5. Architecture

### 5.1 Component overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ apps/web                                                             │
│  AuditResults (/audits/:id)                                           │
│    ├─ Tab: Executivo → ExecutiveReportView                           │
│    │     polls GET /api/audits/:id/executive-report                  │
│    │     charts (SVG/CSS) + LLM sections                             │
│    │     [Exportar HTML] → GET .../executive-report/export           │
│    └─ Tab: Técnico → existing ScoreCard + FindingList                │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│ apps/api                                                               │
│  routes/audits.ts                                                      │
│    GET  /api/audits/:id/executive-report                               │
│    GET  /api/audits/:id/executive-report/export                      │
│  services/executive-report.ts                                          │
│    loadOrStartGeneration(auditId, locale)                              │
│    renderExecutiveHtml(payload, aggregates)                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│ packages/core/src/reports/                                           │
│  aggregate.ts      buildAuditSummary(...) → AuditSummary             │
│  schema.ts         ExecutiveReportSchema (Zod)                       │
│  prompts.ts        buildExecutiveReportPrompt(summary, locale)       │
│  run-executive-report.ts  LLM call + parse + validate                │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data flow

1. User opens Executivo tab on a **completed** audit.
2. SPA calls `GET /api/audits/:id/executive-report`.
3. API loads `Audit.executiveReport`:
   - If `status === 'ready'` and `locale` matches request → return payload.
   - If `status === 'generating'` → `202` + `{ status: 'generating' }`.
   - If missing / `failed` / locale mismatch → set `generating`, run pipeline
     (inline or short background; see §5.4), then `ready` or `failed`.
4. Pipeline:
   - `buildAuditSummary(audit, findings, gscSnapshot?)` — deterministic.
   - `runExecutiveReport(provider, summary, locale)` — single LLM call, JSON out.
   - Persist merged result: `{ status, locale, generatedAt, aggregates, narrative }`.
5. SPA polls every 2s while `generating`.
6. Export endpoint reads cached `ready` payload and returns `text/html` attachment.

---

## 6. Data model

### 6.1 Prisma

Add optional JSON column on `Audit`:

```prisma
model Audit {
  // ...existing fields
  executiveReport Json?
}
```

**Shape** (application-level, not enforced by DB):

```ts
type ExecutiveReportRecord = {
  status: 'generating' | 'ready' | 'failed';
  locale: 'en' | 'pt-BR';
  generatedAt: string | null; // ISO
  model: string | null;
  errorMessage: string | null;
  aggregates: AuditSummary; // deterministic, always stored
  narrative: ExecutiveNarrative | null; // null when failed
};
```

No new table in v1. Regenerating for a new locale overwrites `executiveReport`
for that audit (cache key = audit + locale stored in record).

### 6.2 AuditSummary (deterministic input + chart data)

Produced by `packages/core/src/reports/aggregate.ts`:

| Field | Source |
|-------|--------|
| `projectName`, `rootUrl`, `auditId`, `finishedAt` | Audit + Project |
| `overall`, `byCategory` | `audit.score` |
| `pagesAudited`, `pagesTotal`, `pagesFailed` | `audit.score` / page counts |
| `severityCounts` | tally findings by severity |
| `topRules` | group by `rule`, count distinct `url`, max severity, sample message |
| `categorySeverity` | counts per category × severity (for heatmap optional) |
| `gsc` | optional: clicks, impressions, ctr, lowCtrQueryCount (28d) |

**Top rules cap:** 15 rules, sorted by `(severity weight × page count)` descending.
Severity weights match scoring: error=3, warning=2, info=1 for sort only.

LLM prompt receives **summary only**, not raw finding list (keeps token cost
bounded on 1000-page audits).

### 6.3 ExecutiveNarrative (LLM output, Zod-validated)

```ts
const ExecutiveNarrativeSchema = z.object({
  executiveSummary: z.string().min(50).max(2000),
  topIssues: z.array(z.object({
    rule: z.string(),
    title: z.string(),           // human title, pt-BR or en
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
```

**Sanity checks** after parse (API layer):

- `estimatedScoreFrom` should equal `aggregates.overall` when present (else clamp).
- `estimatedScoreTo` ≥ `estimatedScoreFrom` and ≤ 100.
- Each `topIssues[].rule` should exist in `aggregates.topRules` (warn + drop if not).

LLM is responsible for business wording and scenario labels; numbers are
guided by prompt instructions referencing aggregate facts.

---

## 7. API

### 7.1 `GET /api/audits/:id/executive-report`

- **404** if audit not found.
- **409** if audit status is not `completed` (`{ error: 'audit_not_completed' }`).
- **200** when `status === 'ready'`:

```json
{
  "status": "ready",
  "locale": "pt-BR",
  "generatedAt": "2026-07-10T12:00:00.000Z",
  "aggregates": { "...": "..." },
  "narrative": { "...": "..." }
}
```

- **202** when `status === 'generating'`:

```json
{ "status": "generating" }
```

- **200** with `status: 'failed'` after terminal failure (includes
  `aggregates` + `errorMessage`; UI shows charts without narrative).

**Rate limit:** 10 requests/min per audit id (generation is expensive).

**Cache-Control:** `private, max-age=60` when ready; `no-store` when generating.

### 7.2 `GET /api/audits/:id/executive-report/export`

- Same preconditions as §7.1 (`completed`, `ready`).
- **200** `Content-Type: text/html; charset=utf-8`
- **Content-Disposition:** `attachment; filename="jheo-report-{auditId}.html"`
- Body: standalone HTML document (embedded styles, no external CDN required).

### 7.3 `POST /api/audits/:id/executive-report/retry` (optional v1.1)

Not required for v1; failed state can use a "Tentar novamente" button that
re-GETs with `?force=1` query param to invalidate cache and regenerate.

---

## 8. LLM integration

### 8.1 Provider & model

- Reuse `LLMProvider` from `@jheo/core` (same as suggestions/translate).
- Model: `process.env.JHEO_REPORT_MODEL ?? process.env.JHEO_SUGGESTION_MODEL ?? 'gpt-4o-mini'`.
- Timeout: 60s (report is larger than a single suggestion).
- One retry on `LlmOutputError` with corrective suffix (same pattern as F7).

### 8.2 Prompt guidelines

- System: you are an SEO/GEO consultant writing for a **non-technical stakeholder**.
- User payload: JSON `AuditSummary` + target locale.
- Instruct: use plain language, quantify pages affected, explain Google/UX impact,
  propose 2–3 improvement scenarios with score ranges grounded in issue severity.
- Forbid: inventing page URLs, traffic numbers not in `gsc`, claiming legal/compliance outcomes.
- Output: JSON only matching `ExecutiveNarrativeSchema`.

### 8.3 Generation locking

Use a DB row update to avoid duplicate concurrent generations:

```sql
UPDATE "Audit" SET executiveReport = '{"status":"generating",...}'
WHERE id = $1 AND (executiveReport IS NULL OR executiveReport->>'status' != 'generating')
```

If two tabs race, second request gets `202` until first completes.

---

## 9. UI (`apps/web`)

### 9.1 `AuditResults` tabs

- Default tab: **Executivo** when audit `completed`, else **Técnico** only.
- Tab labels i18n: `audit.results.tabExecutive`, `audit.results.tabTechnical`.

### 9.2 `ExecutiveReportView`

Sections (top to bottom):

1. **Header** — project name, audit date, overall score badge.
2. **Executive summary** — `narrative.executiveSummary` (or skeleton / error).
3. **Score by area** — horizontal bar chart (reuse `ScoreCard` visual language).
4. **Severity distribution** — donut or stacked bar (SVG).
5. **Top issues** — cards from `narrative.topIssues` aligned with `aggregates.topRules`.
6. **GSC** — if `aggregates.gsc` present, show clicks/impressions/CTR + note on
   low-CTR queries; else muted CTA linking to project settings/GSC setup.
7. **Scenarios** — table/cards from `narrative.scenarios`.
8. **Recommendations** — bullet list.
9. **Actions** — `Exportar HTML`, link to Técnico tab, link to Correções filtered by audit.

**Loading:** while `generating`, show aggregates/charts if already partial (optional)
or full-page skeleton with message `audit.executive.generating`.

**Failed:** show aggregates + charts from last successful aggregate build;
banner with retry.

### 9.3 HTML export template

- Server-side string template in `apps/api/src/services/executive-report-html.ts`
  (or core if shared tests needed).
- Mirrors Executivo section order; inline CSS variables for print-friendly layout.
- No JavaScript required in exported file.
- Include footer: "Gerado por JHEO · {date} · {auditId}".

### 9.4 Charts

No new npm dependencies. Implement:

- `CategoryBarChart` — div/SVG bars from `byCategory`.
- `SeverityChart` — conic-gradient or SVG arcs from `severityCounts`.

Shared between SPA components and HTML template via duplicated markup or a
small pure function that returns SVG strings in `packages/core/src/reports/charts.ts`.

---

## 10. i18n

New keys under `audit.executive.*` in `en.json` and `pt-BR.json`:

- Tab labels, section headings, generating/failed messages, export button,
  GSC empty state, impact level labels (`high`/`medium`/`low`).

LLM narrative is generated in the request locale; UI chrome stays in i18n catalogs.

---

## 11. Error handling

| Case | Behavior |
|------|----------|
| Audit not completed | Executivo tab hidden or disabled with hint |
| LLM provider missing | `failed` with `errorMessage: 'no_llm_provider'`; show aggregates only |
| Rate limited | `failed` with retry-after; SPA shows F6 rate-limit copy |
| Invalid JSON from LLM | One retry, then `failed` |
| GSC not connected | Omit GSC section; no error |
| Export while not ready | 409 `{ error: 'report_not_ready' }` |

---

## 12. Testing

### 12.1 `packages/core`

- `aggregate.test.ts` — top rule ranking, severity tallies, empty findings.
- `run-executive-report.test.ts` — mock `LLMProvider`, valid/invalid JSON,
  think-block stripping.

### 12.2 `apps/api`

- Route tests: 404, 409 not completed, 202 generating, 200 ready, export content-type.
- Lock test: concurrent GET does not double-call LLM (mock provider call count).

### 12.3 `apps/web`

- `ExecutiveReportView.test.tsx` — renders sections from fixture payload;
  polling state shows generating message.
- Snapshot optional for SVG chart helpers.

---

## 13. Security & performance

- Export and report endpoints require same trust model as existing API (local single-user).
- Do not embed service account or API keys in HTML export.
- Cap LLM input: summary JSON only; truncate sample messages in `topRules` to 120 chars.
- Log generation duration and token usage when provider returns usage metadata.

---

## 14. Delivery phases

| Phase | Deliverable |
|-------|-------------|
| **P1** | `aggregate.ts` + Prisma column + GET endpoint (aggregates only, `narrative: null`) |
| **P2** | LLM pipeline + cache + Executivo tab (full UI) |
| **P3** | HTML export + i18n polish + tests |

---

## 15. Open questions (resolved)

| Question | Resolution |
|----------|------------|
| Deterministic vs LLM estimates | LLM narratives; aggregates supply facts |
| PDF | Out of scope v1 |
| When to generate | First Executivo view |
| Trend chart | v2 |

---

## 16. Success criteria

- Operator opens Executivo on a completed 1000-page audit; within 90s (LLM
  dependent) sees summary, charts, top issues, and scenarios in pt-BR.
- Second visit loads from cache in < 500ms API time.
- Downloaded HTML opens offline and matches Executivo content.
- Técnico tab unchanged for operators who need raw findings.
