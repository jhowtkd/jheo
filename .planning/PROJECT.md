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

- [ ] **F4 — GSC Connection**: Per-project Service Account (encrypted JSON), siteUrl 1:1 with Project
- [ ] **F4 — GSC Snapshots**: Daily search analytics pull (28-day window), idempotent upsert into GscSnapshot
- [ ] **F4 — GSC API**: Overview/queries/pages read endpoints from stored snapshots
- [ ] **F4 — URL Inspection**: Post-publish best-effort inspect for wordpress/http channels
- [ ] **F4 — Audit enrichment**: Optional gsc-low-ctr plugin via Symbol-injected snapshot context
- [ ] **F4 — Cron sync**: setInterval daily snapshot enqueue (Option A MVP)

### Out of Scope

- OAuth user-flow for GSC — Service Account only (official, robust path)
- Multiple GSC properties per project — 1:1 with Project
- Real-time GSC streaming via SSE/WebSocket
- Inspection history persisted — log only, no InspectionRecord table
- BullMQ repeat jobs for cron — setInterval sufficient for F4 MVP (F5 candidate)
- Auto-discovery of verified GSC properties — user supplies siteUrl manually
- Batch indexing requests — single-URL inspect per publish
- Multi-tenant SaaS, team accounts, auth layer — single-user local tool (F1 invariant)

## Current Milestone: F4 Search Console Integration

**Goal:** Enrich SEO audits with real Google Search Console data and trigger URL Inspection after publish.

**Target features:**
- Pure `@jheo/core/gsc` client (searchanalytics + URL Inspection) with injected auth/fetchFn
- GscConnection + GscSnapshot tables with encrypted Service Account credentials
- BullMQ gscQueue with snapshot + inspect actions; daily cron via setInterval
- 8 REST endpoints for connection CRUD, sync trigger, overview/queries/pages
- Best-effort publish hook (wordpress/http only, non-fatal on failure)
- Optional audit plugin `gsc-low-ctr` (impressions > 100 && ctr < 2%)

**Confirmed decisions:**
| Decision | Value |
|----------|-------|
| Auth | Service Account per project (JSON encrypted at rest) |
| Granularity | Daily snapshot per project |
| Properties | 1:1 GSC property ↔ Project |
| Audit enrichment | Plugin via Symbol `jheo.gsc.snapshot` |
| Publish hook | Best-effort URL Inspection after completed publish |
| Approach | Option A — setInterval cron + single gscQueue |
| Snapshot retention | 28 days default |
| Sync rate limit | 5 requests/minute per project |

## Context

- Monorepo: `apps/api` (Fastify + worker), `apps/web` (Vite SPA), `packages/core` (pure logic)
- Existing patterns: AES-256-GCM encryption (`crypto.ts`), BullMQ queues (`queue.ts`), pure core with injected deps
- Prior specs: `docs/superpowers/specs/2026-07-06-jheo-design.md` (F1), F2, F3, F-Hardening
- F4 design draft planned at `docs/superpowers/specs/2026-07-07-jheo-f4-search-console-design.md`

## Constraints

- **Tech stack**: TypeScript strict, pnpm monorepo, Prisma + Postgres, BullMQ + Redis
- **Core purity**: `packages/core` cannot import Fastify/BullMQ/Prisma — inject fetchFn + auth
- **Security**: Service Account JSON encrypted with `JHEO_SECRET_KEY`; never expose ciphertext in API responses
- **Deployment**: Render/Linux — bind `0.0.0.0:$PORT`, ephemeral filesystem (DB for persistence)
- **Dependencies**: `googleapis` (official) + `google-auth-library` JWT — JS pure, no Dockerfile changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Service Account over OAuth | Official path, no user consent flow needed for local tool | — Pending |
| Option A (setInterval cron) | Simplest MVP; BullMQ repeat deferred to F5 | — Pending |
| 28-day snapshot window | Matches API query default; sufficient for audit enrichment | — Pending |
| Symbol injection for audit plugin | Keeps core pure; optional enrichment without coupling | — Pending |
| Compound PK on GscSnapshot | Idempotent daily upsert by (projectId, date, query, page, device, country) | — Pending |

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
