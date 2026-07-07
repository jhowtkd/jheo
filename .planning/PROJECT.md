# JHEO

## What This Is

JHEO is a Docker-shipped, single-user web app that audits websites (SEO, performance/CWV, GEO/AI-readiness, accessibility, content), generates GEO-optimized content informed by those audits, and distributes approved drafts to WordPress, HTTP endpoints, and GEOFlow Agent bundles. It runs locally via `docker compose up` with a Fastify API + BullMQ worker + Postgres (pgvector) + Redis.

## Core Value

Users can audit a site, generate content grounded in real findings, approve it, and publish — all in one local tool without SaaS lock-in.

## Requirements

### Validated

- ✓ **F1 — Foundation**: Project CRUD, audit pipeline (6 categories), findings + scores, BullMQ worker, Docker compose stack — shipped
- ✓ **F2 — Generation**: Materials RAG (pgvector), LLM adapters (OpenAI/Anthropic/OpenRouter), templates, review state machine — shipped
- ✓ **F3 — Distribution**: WordPress/HTTP/Agent publishers, encrypted channel credentials, publish retry/cancel, generation state aggregation — shipped
- ✓ **F-Hardening**: Worker error surfacing, route test coverage, schema shape tests — shipped

### Active

- [ ] **F5 — Site Discovery**: Map a domain via sitemap + crawl, persist `ProjectPage` rows
- [ ] **F5 — Multi-Page Audit**: One Audit covers all pages of a project; per-page `PageAudit`; aggregated score
- [ ] **F5 — Mapping UX**: Project dashboard with aggregate health card + filterable page table
- [ ] **F5 — Parallel & Cancellable Audit**: `auditPageQueue` (BullMQ Flow) with progress polling and `DELETE /api/audits/:id`
- [ ] **F5 — Re-Audit & Delta**: `POST /api/pages/:id/audit` + `Finding.previousFindingId` lineage + NEW/FIXED/REGRESSION/IMPROVEMENT/UNCHANGED diff

### Cancelled

- ✗ **F4 — Search Console Integration** (started 2026-07-07, cancelled same day). F4 was never advanced past planning. With F5 prioritising domain mapping, GSC features are deferred indefinitely. F4 artifacts: design draft in commit `5849c08`; no spec file. Cancellation reason: F5 is more aligned with the immediate product gap ("user must enter pages one by one").

### Out of Scope

- OAuth user-flow for GSC — Service Account only (F4 was the only path; cancelled)
- Multiple GSC properties per project — 1:1 with Project (F4 invariant; moot after cancellation)
- Hard cap on `maxPages` — F5 default is `0` (no cap); user-controlled via `Project.maxPages`
- Schedule / cron for periodic audits — F5 is run-on-demand
- Synthetic-page clean-up — synthetic `ProjectPage`s from the F5 §4.2 backfill are kept indefinitely
- Cross-project `Finding` aggregation — scope is per-project
- WebSocket / SSE push of audit progress — HTTP polling only
- Auto-discovery of verified GSC properties — user supplies siteUrl manually (F4; moot)
- Batch indexing requests — single-URL inspect per publish (F4; moot)
- Multi-tenant SaaS, team accounts, auth layer — single-user local tool (F1 invariant)

## Current Milestone: F5 Site Mapping & Multi-Page Audit

**Goal:** A project becomes a *domain* (a set of pages), not a *URL*. The user enters a domain, JHEO maps every discoverable page, audits them, and shows aggregate health with per-page detail.

**Target features (4 phases):**
- Phase 1 — Land WIP (`site-discovery.ts`, `ProjectPage`, `audit-job` refactor, `domain` field) as one squashed commit.
- Phase 2 — `GET /api/projects/:id/pages` (filters), `GET /:id/health` (aggregate), dashboard redesign with cards + table.
- Phase 3 — `auditPageQueue` (BullMQ Flow) with concurrency 5; `GET /api/audits/:id/progress`; `DELETE /api/audits/:id` cancellation; `PageAudit` table.
- Phase 4 — `POST /api/pages/:id/audit`; `Finding.previousFindingId` lineage; `GET /api/page-audits/:id` with diff labels (NEW/FIXED/REGRESSION/IMPROVEMENT/UNCHANGED).

**Confirmed decisions:**
| Decision | Value |
|----------|-------|
| Discovery | sitemap.xml (with sitemapindex) + internal-link BFS fallback |
| `maxPages` default | 0 (no cap) — configurable per project |
| Queue model | `auditQueue` (project orchestrator) + `auditPageQueue` (per-page workers) |
| Orchestration | BullMQ Flow Producer (`group.waitUntilFinished`); polling fallback documented |
| Concurrency | `auditPageQueue` = `JHEO_AUDIT_PAGE_CONCURRENCY` env, default 5 |
| Cancellation | `DELETE /api/audits/:id` → status `cancelled`; per-page job checks on start |
| Diff storage | `Finding.previousFindingId` self-FK; diff labels computed in API response |
| Diff labels | NEW, UNCHANGED, IMPROVEMENT, REGRESSION, FIXED (FIXED computed from prior head not in current) |
| Synthetic backfill | F5 §4.2: 1 synthetic `ProjectPage` + 1 `PageAudit` per pre-F5 `Audit` so `Finding.pageAuditId` becomes NOT NULL |

## Context

- Monorepo: `apps/api` (Fastify + worker), `apps/web` (Vite SPA), `packages/core` (pure logic)
- Existing patterns: AES-256-GCM encryption (`crypto.ts`), BullMQ queues (`queue.ts`), pure core with injected deps
- Prior specs: `docs/superpowers/specs/2026-07-06-jheo-design.md` (F1), F2, F3, F-Hardening
- F5 spec: `docs/superpowers/specs/2026-07-07-jheo-f5-design.md`

## Constraints

- **Tech stack**: TypeScript strict, pnpm monorepo, Prisma + Postgres, BullMQ + Redis
- **Core purity**: `packages/core` cannot import Fastify/BullMQ/Prisma — inject fetchFn + auth
- **Migration safety**: `Finding.pageAuditId` becomes NOT NULL only after the F5 §4.2 backfill
- **Deployment**: Render/Linux — bind `0.0.0.0:$PORT`, ephemeral filesystem (DB for persistence)
- **Single-tenant invariant**: pageId in routes is unique enough; no per-tenant scoping needed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PageAudit table over findings diff-in-query | Idiomatic with project pattern (one table per aggregate); lineage FK cheaper than query-time diff | — Pending |
| BullMQ Flow Producer for orchestrator | Native, restart-safe, fewer moving parts than custom polling | — Pending |
| `maxPages = 0` (no cap) by default | User explicitly chose this in brainstorm; accepted risk of very large sites | — Pending |
| HTTP polling for progress | Simpler than SSE/WebSocket; matches F3 publish polling pattern | — Pending |
| Diff labels in API, not in DB | Avoids denormalization; labels are derivable from lineage + severity | — Pending |
| Cancel F4 | F5 product gap (page-by-page entry) is more urgent than GSC | Decided 2026-07-07 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-07 after F4 milestone start*
