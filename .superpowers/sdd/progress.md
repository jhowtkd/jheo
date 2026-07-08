# JHEO F3 — Distribution — progress

(BASE for review-package: commit `a371095` = the F3 plan commit; implementer commits append on top.)

| Task | Status | Commits | Review verdict |
|------|--------|---------|----------------|
| Task 1: Prisma schema (DistributionChannel.projectId + Publish model) | DONE | 797099c | clean (DistributionChannel ganha projectId+relation; Publish model novo com @@unique([generationId, channelId]); Generation ganha publishes back-relation. prisma generate + typecheck clean. F1 reviewState expansion foi mantida como string no Prisma — não é enum-level, valores documentados na spec §5) |
| Task 2: Publisher types + aggregateReviewState | DONE | 546a887 | clean (6 new aggregate tests + 79 existing = 85/85; types + aggregator verbatim from brief; ReviewState type added to types.ts as instructed; no bugs caught, no fixes needed) |
| Task 3: WordPress publisher | DONE | 34d66e7 | clean (6/6 WP tests pass, 91/91 total; typecheck clean; implementer caught brief contradiction — test #3 expects `categories?search=ai` endpoint but brief comment said "tags"; followed TDD; flagged 2 real product gaps for F4/F5: (a) term IDs not attached to post body, (b) fm.tags mapped to categories endpoint not tags. TDD-correct; product-followup tracked) |
| Task 4: HTTP publisher | DONE | 3b591b8 | clean (6 new HTTP tests pass; 97/97 total; typecheck clean; jsonpath-plus@10.2.0 added; preemptive signal pattern reused; two known F2-pattern deviations applied) |
| Task 5: Agent publisher (bundle writing) | DONE | 9e817cd + e2ae80b (test fixup) | clean (4 tests written; review caught brief structural mismatch — tests 2/3/4 had `outputDir` at request top-level but impl reads from `req.config.outputDir`; followup commit moved `outputDir` into the `config` object. Tests 2/3/4 now pass; test 1 still fails on env-only `/data` writability) |
| Task 6: Channels routes (CRUD + encrypted configs) | DONE | d7d7a84 | clean (4/4 tests pass; typecheck clean; AES-GCM via existing crypto.ts; type-discriminated Zod schemas per spec §10; implementer caught brief test 4 missing 503 from expected list and extended) |
| Task 7: Publishes routes (cancel/retry + bundle/files) | DONE | 57bfc94 | clean (3 new tests pass + 1 DB-gated; 7 endpoints per spec §6.2; typecheck clean; archiver@7.0.1 + types installed; implementer caught 3 brief bugs: 5 unused imports removed, missing `include: { channel: true }` added on 3 endpoints, publishQueue stub created. /bundle streaming pattern self-flagged — needs Task 8 integration test) |
| Task 8: Publish-job worker (retry/cancel/aggregate) | DONE | ae049a9 | clean (2/2 tests pass; typecheck clean; concurrency=3; retry policy + cancel signal + aggregate recompute wired; queue.ts + server.ts updated; implementer caught 3 brief bugs: `publish_findMany` typo, unused `_self` in helper, `externalId/Url` mapped to `null`; BACKOFF_MS dead code flagged as F3.5; `response.headers` discarded flagged as Minor F3.5) |
| Task 9: web API client additions | DONE | 6784e72 | clean (80 lines appended to apps/web/src/api.ts; typecheck exit 0) |
| Task 10: SPA pages (ChannelsList + ChannelEditor) | DONE | 4f921d7 | clean (typecheck exit 0; 2/2 web tests pass; 4 files exactly; spec-prescribed useEffect form-init acknowledged; raw JSON config + unguarded delete match brief scope, flagged as future iterations) |
| Task 11: PublishActions component in GenerationReview | DONE | 63bdcbf | clean (typecheck exit 0; 2/2 web tests pass; brief's stub `generationIdForPublish` workaround replaced by adding `getPublish` to api.ts per Step 3; embed correct, no cast needed) |
| Task 12: SPA pages (PublishDetail + AgentBundleView) | DONE | 9534d95 | clean (typecheck exit 0; 2/2 web tests pass; both pages wire data sources correctly; implementer correctly added getPublish per brief Step 3 fix; Reviewer confirmed backend has GET /api/publishes/:id from Task 7; minor: getPublishFiles could be enabled only on completed status — flagged as polish) |
| Task 13: README F3 bring-up notes | DONE | f86f932 | clean (35 lines appended; F1+F2 sections preserved verbatim) |
| Task 14: F3 smoke test | DONE | 652eab4 + 0de1365 (describe.runIf fix) | clean (smoke registers 1 test, skips cleanly without DB; followup commit fixed the 3-arg describe.runIf pattern — same bug F2 review caught and F3 implementer replicated briefly) |
| Task 15 followups | DONE | 844a135 (agent test 1 use tmp) + 69f5007 (prisma-schema-shape-f3 skip) | clean (Agent test 1 now uses tmp outputDir — 4/4 agent tests pass; F3 prisma-schema-shape now uses canRunDb precheck, skips cleanly. Remaining 1 api failure is `prisma-schema-shape.test.ts` (F2) — pre-existing F1-baseline DB-auth env issue) |

## Final whole-branch review

Opus reviewer found: 0 Critical, 5 Important, 12 Minor. Approved merge-ready. Single fix commit `e530157` addressed the 2 most actionable Important findings: (a) partial-state rollback on enqueue failure, (b) wire BACKOFF_MS that was declared but unused. Other 3 Important (agent outputDir base path config, WordPress term-resolution silent error swallowing, /bundle archiver ordering race) are documented in cross-cutting followups for F4/F5.















## F4 — Hardening — progress

(BASE for review-package: commit `a371095` = the F3 plan commit. Implementer commits append on top; per-task BASE = previous task's HEAD, MERGE_BASE for whole-branch = a371095.)

| Task | Status | Commits | Review verdict |
|------|--------|---------|----------------|
| Task 1: PublishEvent model + migration (H-11 pt.1) | DONE | 0a4b96e (amended from eee3354 after C2 whitespace-noise fix) | clean — Spec ✅ + Approved. Minors: missing trailing newline on schema.prisma (cosmetic, Prisma parses fine); no-DB hand-written migration SQL (per brief fallback, byte-identical to expected body); pre-existing prisma@5.17 vs @prisma/client@5.18 warning (not introduced). |

## Whole-branch Minor ledger (carryover)

- **M-001** `apps/api/prisma/schema.prisma` trailing newline dropped on append (Task 1). Trivial to fix (`printf '\n' >> ...`); can be folded into Task 2.
| Task 2: log.ts + pino-http (H-12 pt.1) | DONE | acf2127 | clean — Spec ✅ + Approved. 3 brief errors handled correctly: (1) `@types/pino-http@^10` skipped (pino-http ships own types); (2) `base: undefined` cast under exactOptionalPropertyTypes; (3) `app.register(httpLogger)` → `httpAccessLogHook` onRequest adapter (Fastify 4 API mismatch, brief was wrong). Minors: `base: null` would drop the cast; `req.id` defensive check in requestIdHook is dead code (harmless). |
| Task 3: isSafeOutboundUrl + fetchWithGuard (H-08 pt.1) | DONE | c2df6bf | clean — Spec ✅ + Approved. 9/9 unit tests pass; typecheck clean. 2 brief deviations handled correctly: (1) dropped unused `lookup` re-import; (2) `noUncheckedIndexedAccess` narrowing on tuple destructuring. Minors: trailing-newline dropped on both files (M-001 carryover). |
| Task 4: withGenerationLock helper (H-01 pt.1) | DONE | 1e70b39 | clean — Spec ✅ + Approved. lock.test.ts skips cleanly without DB; 3-arg `describe.skipIf` form (chained `describe.skipIf(!canRunDb)('name', fn)`) used correctly. Minors: trailing-newline dropped (M-001 carryover); `import { Prisma, type PrismaClient }` consolidated to `import { Prisma, PrismaClient }` (semantically identical, disclosed). |
| Task 5: httpUrl Zod + URL pre-validation (H-09) | DONE | 6aea3a0 (amended from 5770160 after C3 fix) | clean — Spec ✅ + Approved after fix. 1 Critical: new materials test used `it.runIf(canRunDb)` (pre-existing file pattern) instead of spec-mandated `describe.skipIf(!canRunDb, ...)` 3-arg form; rewritten in 3-arg form. Minors: `isHttpUrlProtocolError` + local `hasUrlProtocolIssue` slight duplication; PUT handler also mapped (symmetric extension, accepted). 6th file `channels-config.ts` is justified (F3 factored out). |
| Task 6: SSRF guard wired in (H-08 pt.2) | DONE | 90ce3c3 (amended from 795ce8e after F2+F3 fix) | clean — Spec ✅ + Approved after fix. 1 Important: brief's 3-arg `describe.skipIf` is broken in vitest 2.0.5 in single-describe files; curried form used instead (verified by reviewer). 2 Minors fixed: marker describe was unnecessary dead code; `as unknown as ReturnType<typeof fetch>` cast narrowed. `packages/core/src/distribution/http.ts` unchanged (F3 infra-free invariant preserved). |
| Task 7: worker lock + cross-project + H-02 (H-01+03+02) | DONE | 1929e8f | clean — Spec ✅ + Approved. H-01 wrap correct (tx.* + pg_advisory_xact_lock); H-03 loader exported + project-scoped; H-02 static assertion in place (source was already clean). 6 deviations adjudicated correctly: real schema used (`type` not `kind`); `probe` opt-in 4th arg for test affordance; curried `skipIf`; in-handler query was already project-scoped (verified line 64-67) so no swap needed. Minor: `$transaction` proxy duplicated in 2 fakePrisma setups (DRY nit). |
| Task 8: PublishEvent writes on transitions (H-11 pt.2) | DONE | 1fe5cf6 | clean — Spec ✅ + Approved. `recordPublishTransition` helper correct (reads current status, writes event row, updates status). All 5 transitions wired in worker + 2 in routes. Brief's 4-arg call bug correctly identified; 3-arg form follows signature + assertion (self-consistent). Minors: test fakes return `status:'running'` but worker first call happens when actual status is `'queued'` (existing test assertions don't check event rows, so harmless); helper has no `$transaction` (per brief; latent race risk noted in JSDoc); no status enum validation. |
| Task 9: Prisma.InputJsonValue typing (H-06) | DONE | fa912f4 (amended from 4439742 after S1 fix) | clean — Spec ✅ + Approved after fix. 1 Important (S1): brief's file list was narrower than spec wording ("in `apps/api/src/routes/`"); 2 additional `as object` sites in `audits.ts:22` and `generations.ts:56` were left untouched in initial pass, then converted in fix commit. All 4 sites in `apps/api/src/routes/` now use `Prisma.InputJsonValue`. No `any` introduced; typecheck clean; no regressions. |
| Task 10: validTransitions typed (H-07) | DONE | a83ee85 (with revert 81dfaa4 of empty 988f54d) | clean — Spec ✅ + Approved after fix. Initial commit `988f54d` was `--allow-empty` against a false brief premise (the symbol did not exist in target file). Reviewer flagged H-07 unsatisfied (Critical). Fix: reverted empty commit + added real typed map to `packages/core/src/distribution/aggregate.ts` with brief's exact 5-state values, exported. Purely additive; existing `aggregateReviewState` untouched. Typecheck clean; aggregate tests 6/6. |
| Task 11: WP term IDs + structured error (H-04+05) | DONE | eb92268 | clean — Spec ✅ + Approved. `WordPressPublishError` class correct; tags attached after body build; error branch orders 5xx/3xx → structured, 4xx → plain. `termIds` placed on `PublishRequest` (cross-adapter, defensible per spec intent). Infra-free invariant preserved (verified by grep). 9/9 WP tests pass. Minors: trailing-newline (M-001); `WordPressPublishError` not re-exported from `index.ts` (worker will need direct import — out of scope). |
| Task 12: Publish.id scoping + cuid rotation (H-10) | DONE | 0756103 | clean — Spec ✅ + Approved. GET 404 on cross-project mismatch (via `x-project-id` header); cuid rotation on P2002. 6 concerns adjudicated correctly: brief assumed `createCuid` + `isPrismaUniqueViolation` existed (they didn't — added); `$transaction` array-form restriction forced callback-form + inline rotation (duplication minor); `vi.spyOn` correctly restored; `modelOutput` → `outputMarkdown` real field. Optional follow-ups noted (refactor helper for tx client; narrow GET include). |
| Task 13: console.error -> pino (H-12 pt.2) | DONE | a6c7130 | clean — Spec ✅ + Approved. No-op commit per brief escape hatch: zero `console.error` sites in 3 target files (verified by grep) because Task 2's pino-http integration already covered them. Commit body cites exact grep, names Task 2 as cause, recommends follow-up (mark DONE/N/A or convert to CI lint guard). Important (plan-level): Task 13 now redundant with Task 2. Minor (doc): brief title conflates `pino-http` with `pino`'s `log.error`. |
| Task 14: f3-smoke pino-http + PublishEvent; log-shape test (H-12 pt.3 + CI bar final guard) | DONE | 66d3b71 (test) + docs SHA (this commit) | clean — Spec ✅ + Approved. 2 implementer deviations from brief adjudicated: (1) `buildApp` → `buildServer` (actual codebase factory); (2) `Capture.write` 3-arg brief signature required `cb` but pino calls `stream.write(s)` with single arg → `cb is not a function` runtime error. Fixed by making `cb` optional + adding inline rationale comment. ci is unchanged; existing `it.runIf(canRun)` pattern kept for new pino-http test (DB conditional). 2/2 log-shape tests pass; f3-smoke now registers 3 tests (1 unconditional `prisma.publishEvent` smoke + 2 `.runIf(canRun)` DB-gated); all previously-passing tests still pass: apps/api 38 passed / 19 skipped (was 35/18 — arithmetic: +3 logged-shape+f3smoke-new, +1 f3smoke-skipped), packages/core 104/104, apps/web 2/2; full typecheck clean across 3 workspaces. **This is the final observation step before whole-branch review; the H-12 pt.3 + log-shape + final-guard CI bar is in place.** |
| Task 14: f3-smoke extended + log-shape test (H-12 pt.3) | DONE | 66d3b71 (test) + 66eabab (docs) | clean — Spec ✅ + Approved. 2/2 log-shape + 3 f3-smoke (1 unconditional prisma.publishEvent pass + 2 DB-skipped). Full suite 0 failures: core 104/104, api 38/19-skipped, web 2/2. 2 brief deviations adjudicated: `buildApp`→`buildServer` (factory name error in brief); `Capture.write` `cb?` optional (pino 9.14.0 single-arg call, brief's 3-arg signature was runtime-broken). `progress.md` `git add -f` artifact (file is gitignored; Tasks 1-13 wrote filesystem-only, Task 14 made first git-tracked commit). |

## F4 Final Whole-Branch Review Fixes (post-Task 14)

Final reviewer found 2 Critical + 4 Important + 7 Minor. User approved fixing C-1..C-2, I-1..I-4. Minor issues recorded in M-001..M-007 ledger (out of scope this milestone).

| Fix | H-Item / Finding | Commit | Verdict |
|---|---|---|---|
| Fix 1: single source of truth for x-request-id (I-2) | H-12 | e510c14 | clean — requestIdHook sole generator; pino-http's genReqId mirrors it. |
| Fix 2: tighten recordPublishTransition to PublishStatus (I-3) | H-08/H-11 | bb290eb | clean — TS boundary enforced; CHECK constraint deferred to future milestone. |
| Fix 3: atomic recordPublishTransition (I-1 + I-4) | H-11 | 239f12e | clean — internal $transaction; JSDoc rewritten to match reality. |
| Fix 4: consolidate SSRF guard — delete safe-fetch.ts (C-1) | H-08 | ac63ca6 | clean — `isSafeOutboundUrl` + `fetchWithGuard` + `guardedFetch` are the single policy; 3 test files consolidated to `ssrf-guard.test.ts` (19 cases, +3 from IPv6 coverage). **Bonus fix:** IPv6 bracket-stripping caught during consolidation (`URL.hostname` keeps brackets on `[::1]`, made `isIP` silently let loopback through). |
| Fix 5: server-derived cross-project check on GET /api/publishes/:id (C-2) | H-10 | 4aa1952 | clean — `prisma.project.findFirst({ orderBy: createdAt })`; honest JSDoc about MVP single-user. |

**Final state:** typecheck clean (3/3), apps/api 41/19, packages/core 104/104, apps/web 2/2, **0 failures**.

## Whole-branch Minor ledger (carryover, NOT addressed this milestone)

- **M-001** `apps/api/prisma/schema.prisma` trailing newline dropped on append (Task 1). [deferred to next touch of schema]
- **M-002** `WordPressPublishError` not re-exported from `packages/core/src/distribution/index.ts`. Latent; no current `instanceof` check in `apps/api`.
- **M-003** `PublishEvent` audit-row ordering on retry is non-deterministic without `attempts` join. Future audit-log reader should denormalize `attempts` into `PublishEvent.message` or a dedicated column.
- **M-004** Pre-F4 comments in `materials.ts` (line 49) and elsewhere referenced `safeFetch`; replaced in Fix 4. [resolved]
- **M-005** Test naming inconsistency (`f3-suffix` markers). Future cleanup.
- **M-006** `log-shape.test.ts` `Capture.write` `cb?` optionality could use a one-line comment explaining pino's single-arg call.
- **M-007** `withGenerationLock` hash collision risk (theoretical, 2^63-1 space). Could add a unit test in `db/lock.test.ts` asserting two arbitrary generationIds don't collide on the seeded distribution.

## F4 Final Closure (post-whole-branch-review)

After the final whole-branch review (2 Critical + 4 Important + 7 Minor), the 2 Criticals and 4 Importants were fixed in 5 commits (see "F4 Final Whole-Branch Review Fixes" section above). The re-reviewer flagged one residual Important: the I-2 round-trip contract (request-id, response header, access log) was not covered by an end-to-end test. Closed in:

| Fix | Commit | Verdict |
|---|---|---|
| Final: I-2 round-trip test in f3-smoke | ff71342 | clean — 3 cases (honored / generated / malformed-rejected) added to f3-smoke; typecheck clean; f3-smoke now 5 tests (1 unconditional + 4 DB-gated). |

**Final state (HEAD = ff71342):**
- 25 F4 commits on main, all Approved or Approved-after-fix
- typecheck clean across 3 workspaces
- apps/api 41/19, packages/core 104/104, apps/web 2/2, **0 failures**
- 7 Minors (M-001..M-007) recorded in the carryover ledger (not addressed this milestone)

---

## F6 — i18n (pt-BR/en) + Plain-Language

**Plan:** `docs/superpowers/plans/2026-07-08-jheo-f6-i18n.md` (12 tasks, TDD)
**Spec:** `docs/superpowers/specs/2026-07-08-jheo-f6-i18n-design.md`
**Branch:** main (per user opt-out of worktree)
**Status:** starting


| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 1 | ✅ DONE (review Approved) | a73f8d8 | Schema + migration. `prisma migrate dev` blocked by pre-existing baseline (F2 `PublishEvent` migration references `Publish` which only exists from `db push`, not migrations); implementer used `prisma migrate diff` to hand-author the equivalent SQL, verified via `migrate deploy`. **Follow-up: add a foundation baseline migration** so future devs can run `migrate dev` cleanly. Pre-existing test failure `test/jobs/generate-job.test.ts` flagged but confirmed unrelated to F6 (last touched by F2/F3 work). |
| 2 | ✅ DONE (review Approved; chore fix 44b35d8) | 1469953 | negotiateLocale + LOCALE_NAMES. Implementer hit Node 25 localStorage stub shadowing jsdom and added a guarded `apps/web/test/setup.ts` + 3-line `vite.config.ts` wiring. Reviewer flagged as out-of-scope; I accepted because it unblocks every future web test. Reviewer also asked to pin Node/vitest/jsdom versions in the shim header — done in chore commit 44b35d8. |
| 3 | ✅ DONE (review Approved; chore fixes 44b35d8, f835b37) | 0e484a5 | registerLocaleHook. Reviewer flagged trailing newlines as Minor; fixed in chore f835b37 (also caught Task 2's locale.ts which had the same issue). Test deviation: brief tried to register route inside `it` block but Fastify 4.28.1 locks the router after `app.ready()`. Implementer moved the route into `beforeAll` — minimum change, behavior unchanged. |
| 4 | ✅ DONE (review pending) | aa493c1 + fix 951c86c | buildTranslationSystemPrompt. Implementer flagged a pre-existing typecheck error in Task 2's `locale.ts` under `noUncheckedIndexedAccess: true`. Fixed in 951c86c with `as const satisfies` pattern (the same fix applied to both api and web). Task 4 deliverable landed cleanly; typecheck green. |
| 5 | ✅ DONE (reviewer flagged; fixed 886f21a) | a4235be + fix 886f21a | translateBatch. Reviewer caught a real latent bug — `result.findIndex(r.original === t.text)` would race on duplicate input strings (two findings with the same message), leaving the second slot at `translated: ''`. Fixed by tracking the input slot index on each toTranslate item and addressing `result[t.slotIdx]` directly. Added a regression test that fails without the fix and passes with it. Reviewer's other notes were Minor (stale doc comment, `as any` casts in tests) — not addressed (not worth a separate commit). |
| 6 | ✅ DONE (review Approved) | 238de0f | POST /api/translate + rate limit + server refactor. Reviewer confirmed all spec requirements (400/429/503, 10 req/min/IP, route passes through translateBatch). The one literal deviation (route registered after pageRoutes instead of between publish+page) is cosmetic — Fastify matches by URL. `buildLlmProviders` refactor preserves runtime behavior (same keys, same OPENAI_BASE_URL, same order). |
| 7 | ✅ DONE (review Approved) | 4f78d30 + a3436f7 | Generation.locale + system prompt. Brief assumed an F2 system prompt existed; it didn't. User approved Option A: add real system prompt to `@jheo/core`'s `runGeneration` with `locale` and `localeName` slots and the plain-language register from spec §4.4. Core purity preserved (`buildSystemPrompt` lives in core with its own `LOCALE_NAMES` lookup, no infra imports). Two clean commits: core first (adds buildSystemPrompt + generationContext.locale), then api (route + worker plumbing + tests). 7 core tests + 4 api tests pass. |
| 8 | ✅ DONE (review Approved; chore fix c37efed) | 9699ff8 | i18next init + en/pt-BR catalogs + parity test. Reviewer flagged trailing newlines; fixed in chore c37efed. (Side note: branch in this checkout is `automatizacao-seo`, not `main` — the user's working branch. All F6 commits linear and clean.) |
| 9 | ✅ DONE (review Approved) | 2fb65bf | LanguageToggle + persistence. Brief's verbatim test code required `@testing-library/jest-dom` (not installed) and a `SupportedLocale` re-export from `i18n/index.ts` (not in brief). Both fixes are real and minimal. Commit bundles 13 files (4 infra + 5 feature + 2 en/pt-BR topbar.language keys + 2 other small changes) — defensibly bundled because every change is required to make the brief's verbatim code pass. Reviewer retracted implementer's incorrect Concern B (topbar.language key was already in catalogs). |
| 10 | ✅ DONE (review Approved) | 3b97a19 | Chrome translation pass — 14 pages + 5 components + 2 catalogs + 1 test, 1179 insertions, 473 deletions. All const-map removals are forced by the i18n migration (they held hardcoded English). The pre-existing ProjectDashboard duplicate "Last audit" block was a merge mistake; removing it is dead-code cleanup, not a refactor. Reviewer flagged 5 minor observations (cross-namespace key reuse, `sync` vs `Sincronização` choice, etc.) — all sensible follow-up polish, not blocking. Task 11 follow-up: breadcrumbs live under per-page namespaces; could consolidate later. |
| 11 | ✅ DONE (review Approved) | 40411c9 | HelpTip + useDataTranslations + wire-up in FindingList and GenerationReview. 5 brief deviations, all well-justified: lazy `localeFetch` (so test mock works), `TranslateError` rename (avoid self-referential type), `?` prefix in HelpTip `aria-label` (so test can match), `Generation.locale` field added to web type, `FindingCard` props extended (existing decomposition preserved). 8 new tests (4+4) + 16 pre-existing = 24/24. typecheck green. |
| 12 | ✅ DONE (gate passed) | (no commit; verification only) | Final integration: typecheck green end-to-end (core+api+web). Full test suite: 121/121 core + 24/24 web + 106/153 api (46 skipped, 1 pre-existing `generate-job.test.ts` Redis failure unrelated to F6). End-to-end smoke against compiled server (`node apps/api/dist/smoke.mjs`): 11/11 pass — `/api/health` echoes `Content-Language`, 404 echoes it, `POST /api/translate` validates body (400 on empty/oversize/bad-context) and short-circuits on en. Prettier config drift: 27-30 files in each package fail `pnpm lint` (whole-repo pre-existing issue, not F6-introduced — F6 files follow the same style as the rest of the repo). |

## F6 — Whole-branch review (post-whole-branch)

Whole-branch reviewer verdict: **Ready to merge: Yes, with one follow-up.**

3 Importants, 12 Minors. Importants fixed in 7e4278b:
1. **Sidebar chrome in Layout.tsx translated** — moved NAV array inside component, added 3 new keys (`sidebar.workspace`, `sidebar.userName`, `sidebar.userMeta`) to both en.json and pt-BR.json.
2. **Orphan `errors.*` keys used** — `FindingList` and `GenerationReview` now render `t(\`errors.${error}\`)` when the LLM hook reports a specific error, with `topbar.translationUnavailable` as fallback.
3. **`splitTranslations` silent fallback** — added regression test for the LLM-returns-fewer-lines case; function now accepts an optional `log` callback (defaults to `console.warn`) so the truncation is visible in logs.

12 Minors recorded for follow-up (not blocking):
- M-001: `buckets` Map in rate-limit grows unboundedly (single-user local tool — fine for now)
- M-002: provider ordering hard-codes OpenAI first (key-availability, not user preference)
- M-003: `targetLocale` ternary in api.ts won't scale to 3rd locale
- M-004: `ensureI18n` has no error path (will hang on malformed catalog)
- M-005: `buildSystemPrompt` returns the locale tag verbatim for unknown locales (could produce bad prompts)
- M-006: `translated` flag confusion when `targetLocale === req.locale`
- M-007: spec doesn't mention `useDataTranslations` or `HelpTip` (documentation drift)
- M-008: `test-types.d.ts` is a non-obvious pattern
- M-009: cross-namespace key reuse (e.g. `projects.dashboard.statusLabel` used by PublishDetail)
- M-010: `sync` vs `Sincronização` jargon in pt-BR
- M-011: `useDataTranslations` cache is per-instance
- M-012: breadcrumbs live under per-page namespaces instead of a shared `breadcrumbs.*` namespace

## F6 — Final state

**Branch:** `automatizacao-seo` (user's working branch)
**Commits:** 19 total F6 commits (1 docs plan + 17 feature/fix/chore + 1 review-fix)
**Typecheck:** clean end-to-end
**Tests:** 24/24 web, 121/121 core, 36/36 F6-specific api, 107/153 full api (1 pre-existing generate-job Redis fail, 46 skipped)
**End-to-end smoke:** 11/11 against compiled server
**Reviewer verdict:** Ready to merge

## F7 — Autonomous Fix Suggester

**Plan:** `docs/superpowers/plans/2026-07-08-jheo-f7-implementation.md` (15 tasks, TDD)
**Spec:** `docs/superpowers/specs/2026-07-08-jheo-f7-autonomous-fixes-design.md`
**Branch:** `automatizacao-seo`
**Status:** in progress

| # | Task | Status | Commit | Brief | Report | Review |
|---|------|--------|--------|-------|--------|--------|
| 1 | Schema + migration | ✅ DONE | fcb8a82 | task-1-brief.md | task-1-report.md | spec ✅, quality Approved |
| 2 | suggestionOutputSchema | ✅ DONE | 7a52e0b | task-2-brief.md | task-2-report.md | spec ✅, quality Approved |
| 3 | buildSuggestionContext | ✅ DONE | 98e4abb | task-3-brief.md | task-3-report.md | spec ✅, quality Approved |
| 4 | 6 prompt files | ✅ DONE | 3ebc2c3 | task-4-brief.md | task-4-report.md | spec ✅, quality Approved |
| 5 | runSuggestion | ✅ DONE | a4c834b | task-5-brief.md | task-5-report.md | spec ✅, quality Approved |
| 6 | POST/GET /api/suggestions | ✅ DONE | 536eb41 + 723c8a2 (htmlSnapshot fix) | task-6-brief.md | task-6-report.md | spec ✅, quality Approved |
| 7 | accept/reject routes | ✅ DONE | 343a00e | task-7-brief.md | task-7-report.md | spec ✅, quality Approved |
| 8 | rate limit test | ✅ DONE | 36b657a | task-8-brief.md | task-8-report.md | spec ✅, quality Approved |
| 9 | i18n catalogs en/pt-BR | ✅ DONE | 934585e | task-9-brief.md | task-9-report.md | spec ✅, quality Approved |
| 10 | api.ts typed client | ✅ DONE | 3f7da22 | task-10-brief.md | task-10-report.md | spec ✅, quality Approved |
| 11 | DiffView + ConfidenceChip | ✅ DONE | b807519 | task-11-brief.md | task-11-report.md | spec ✅, quality Approved |
| 12 | FixCard + SuggestionActions + Empty | ✅ DONE | 6a7dab6 | task-12-brief.md | task-12-report.md | spec ✅, quality Approved |
| 13 | FixesPage + sidebar + route | ✅ DONE | ad28d77 | task-13-brief.md | task-13-report.md | spec ✅, quality Approved |
| 14 | cross-link AuditResults | ✅ DONE | 6c4bd16 | task-14-brief.md | task-14-report.md | spec ✅, quality Approved |
| 15 | smoke E2E + README + progress | ✅ DONE | 66fa242 | task-15-brief.md | task-15-report.md | spec ✅, quality Approved |

### Whole-branch minor ledger
- M-F7-001: `prisma-schema-shape-f7.test.ts` trailing newline missing (Task 1, M-001 carryover; non-blocking)

### Notes
- Pre-existing `generate-job.test.ts` failure on this branch (last touched F4 commit 1929e8f, unrelated to F7) — carried over from F6.
- Migration baseline fix: implementer baselined all 7 pre-existing migrations in `_prisma_migrations` so future `migrate deploy` works cleanly. Schema baseline is now consistent.

### Whole-branch minor ledger (updates)
- M-F7-001: `prisma-schema-shape-f7.test.ts` trailing newline missing (Task 1, M-001 carryover; non-blocking)
- M-F7-002: `apps/api/src/routes/suggestions.ts` does not enforce `x-project-id` header (spec §6.2 step 4 + F3 invariant); brief did not call for it. Cross-cutting concern, F3-pattern.
- M-F7-003: `Suggestion.model` is persisted as `${providerName}:unknown` (api layer doesn't read LLM response.model); brief-mandated, F2 pattern differs (F2 reads `res.model`).
- M-F7-004: `htmlSnapshot` is nullable; pre-existing rows have `null`. F7 will only suggest for pages that have been re-audited after this migration. Out of scope to backfill.

### Task 6 + fix complete
- Commits: 536eb41 (Task 6 main) + 723c8a2 (fix: add htmlSnapshot to ProjectPage + migration + page-audit-job write + remove cast)
- 8/8 suggestion-route tests pass; 118 passed in apps/api suite (1 pre-existing failure unrelated)
- typecheck clean across 3 workspaces
- Review: spec ✅, quality Approved (with M-F7-002/003/004 noted)

## F7 — Whole-branch review

**Reviewer:** Sonnet (whole-branch review)
**Verdict:** ✅ Approved with Minor (8 minors, 0 Critical, 0 Important)
**Spec §12 acceptance criteria:** 12/12 met

### Strengths (from reviewer)
- Invariants held: `packages/core/src/suggestions/` infra-free; F5.4 delegation only; `ProjectPage.htmlSnapshot` persisted atomically.
- Sound architecture: `@@unique([findingId, status])` + 5min supersede composition; 1:N Suggestion→Finding.
- Type discipline: no `any`, no `as unknown as` in production source.
- Test discipline: red→green TDD across 15 tasks.
- i18n parity + `ensureI18n()` global benefit.

### Whole-branch minor ledger (carryover from task reviews + new)
- M-F7-001: `prisma-schema-shape-f7.test.ts` trailing newline missing (Task 1; M-001 carryover)
- M-F7-002: `x-project-id` header not enforced (Task 6; spec §6.2 step 4 vs F3 invariant)
- M-F7-003: `Suggestion.model` persisted as `${providerName}:unknown` (Task 6; brief-mandated)
- M-F7-004: `htmlSnapshot` nullable on pre-existing rows (Task 6 fix; design choice)
- M-F7-D: CWV slice regex over-escaped (Task 3; readability)
- M-F7-E: `fixes/*` i18n file changes + 5 component files lack trailing newline (M-001 carryover)
- M-F7-F: README F7 section lacks trailing newline (M-001 carryover)
- M-F7-G: `SuggestionActions` button disable race (Task 12; sync handlers, no real disable)
- M-F7-H: `FixesPage` direct `fetch` for `/api/audits/:id/findings` bypasses typed client (Task 13; consistency)

### Final state (merge-ready)

| Workspace | Test count | Δ vs F6 |
|---|---|---|
| `packages/core` | 150 passing | +29 (was 121) |
| `apps/web` | 36 passing | +12 (was 24) |
| `apps/api` | 128 passing, 1 pre-existing failure, 47 skipped | +21 (was 107) |

- 19 F7 commits on `automatizacao-seo` (1 plan + 1 fix + 16 feature/test/docs + 1 spec + 1 plan pre-flight fix)
- typecheck exit 0 across all 3 workspaces
- Whole-branch reviewer: 0 Critical, 0 Important — **merge-ready**
- 9 minors recorded in carryover ledger (not blocking)

### Commits (chronological)
1. `e4172ab` — spec
2. `8fa04d4` — plan
3. `f1e2cf8` — plan pre-flight fix (Task 5 model config)
4. `fcb8a82` — Task 1: Suggestion schema + migration
5. `7a52e0b` — Task 2: SuggestionOutput Zod schema
6. `98e4abb` — Task 3: buildSuggestionContext
7. `3ebc2c3` — Task 4: 6 prompt files
8. `a4c834b` — Task 5: runSuggestion orchestrator
9. `536eb41` — Task 6: POST/GET /api/suggestions
10. `723c8a2` — Task 6 fix: ProjectPage.htmlSnapshot + page-audit-job write
11. `343a00e` — Task 7: accept/reject routes
12. `36b657a` — Task 8: rate limit test
13. `934585e` — Task 9: i18n catalogs en/pt-BR
14. `3f7da22` — Task 10: api.ts typed client
15. `b807519` — Task 11: DiffView + ConfidenceChip
16. `6a7dab6` — Task 12: FixCard + SuggestionActions + EmptyFixesState
17. `ad28d77` — Task 13: FixesPage + sidebar + route
18. `6c4bd16` — Task 14: cross-link on AuditResults
19. `5779487` — Task 15: smoke E2E + README + progress.md
