# JHEO S0 — Shared Foundations — progress

(BASE for review-package: commit `e674cb0` = S0 plan commit, branch base.)
Branch: s0-shared-foundations

| Task | Status | Commits | Review verdict |
|------|--------|---------|----------------|
| Task 2: humanError mapper | DONE | 98248dd | clean (pure, 5 branches, SENTINEL_KEYS lookup, 10/10 tests, never-throws covered; minor cosmetic notes only) |
| Task 3: QueryClientProvider test wrapper | DONE | a9f0e94 | clean (helper verbatim from brief, typecheck clean, retry:false/gcTime:0/staleTime:0 isolation; reviewed inline — trivial transcription) |
| Task 4: EmptyState/ErrorState components | DONE | 02830fe | clean (both components + barrel, retry gating verified across 3 combos, role=alert default, pt-BR assertions; 2 justified deviations: {...params} spread for exactOptionalPropertyTypes, MemoryRouter for Link context) |
| Task 5: useBackendReachable hook | DONE | f116dcc | clean (hook returns all 3 fields, 15s refetchInterval, reachable=!isError&&data.ok, 3/3 branch tests; 2 deviations verified safe: tsconfig rootDir src→. is safe under --noEmit+vite build, shouldAdvanceTime:true is correct RQ5 pattern. Note for T7: epoch lastCheckedAt sentinel) |
| Task 6: ProjectsList refactor | DONE | 810ff07 + cd95315 (import fix) | clean after fix (error→humanError/ErrorState, page-local EmptyState deleted, SVG art moved to children, focusNew deleted, CTA hash link; exactOptionalPropertyTypes handled via conditional spread — cross-task contract friction noted for T8 alignment; import-style nit fixed in cd95315) |
| Task 7: HealthIndicator refactor | DONE | 340b9d8 + c87d349 (pending/down fix) | clean after fix (consumes useBackendReachable, useEffect/setInterval/useState block gone, import removal safe; IMPORTANT inherited regression fixed in c87d349: hook now exposes status pending|reachable|down so no red-dot flash on mount) |

## S0 Follow-up items (tracked for S1)
- **exactOptionalPropertyTypes friction**: `humanError`'s `HumanError.params?`/`retry?` vs `ErrorStateProps.params?`/`retry?` requires conditional spread (`{...(e.params ? { params } : {})}`) at every consumer. Two reviewers flagged this. S1 rolls out humanError across many error surfaces — consider aligning the contract then (make `retry: boolean` non-optional with default `false` in HumanError; keep params handling the spread). NOT a blocker for S0 merge; the pattern is idiomatic TS under exactOptionalPropertyTypes.
| Task 8: Full build + done-criterion verification | DONE | (verification only, no commit) | clean (61/61 tests, build 1.42s no regression, all 7 done-criteria verified: humanError 10/10, states 9/9, hook 4/4, refactors complete, catalog 7+7 keys, page-local/focusNew/setInterval all gone) |
| Task 8 fix: EmptyState kind+COPY + ProjectsList integration test | DONE | 18b61aa | clean (Critical resolved: kind+COPY discriminant restored to frozen contract, 3 EmptyFixesState entries migrated; Important resolved: ProjectsList test exercises real api.ts error format through real humanError→ErrorState, closing regex-against-real-errors gap; +6 tests, 67/67) |

## FINAL BRANCH STATE
- Branch: s0-shared-foundations
- Base: e674cb0 (plan commit) | Head: 18b61aa
- Commits: 11 (8 task commits + 2 review fixes + 1 plan-syntax fix)
- Tests: 67/67 passing | tsc clean | vite build clean (no bundle regression)
- Final whole-branch review: APPROVED (Critical kind+COPY + Important integration test fixed; one Important #3 regex gap closed by ProjectsList test using real api.ts error format)
- S0 merge-ready
