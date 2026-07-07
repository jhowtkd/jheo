# Phase 1: GSC Connection - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning
**Source:** Milestone F4 brainstorming + research synthesis

<domain>
## Phase Boundary

Phase 1 delivers the foundation for all GSC work: Prisma schema, encrypted credential storage, connection CRUD API, and live validation against Google Search Console. No snapshot sync, no read APIs, no UI — those are later phases.

**In scope:** GscConnection model + migration, gsc-config.ts validation, gsc-auth.ts JWT helper, routes/gsc.ts connection endpoints (GET/PUT/DELETE), connection test via sites.get, decrypt_error handling.

**Out of scope:** GscSnapshot table, BullMQ gscQueue, cron, overview/queries/pages endpoints, audit plugin, publish hook, web UI.
</domain>

<decisions>
## Implementation Decisions

### Auth & Credentials
- Service Account JSON per project (not OAuth)
- Encrypt full SA JSON with existing AES-256-GCM (`crypto.ts` + `JHEO_SECRET_KEY`)
- Never return `serviceAccountCiphertext` in API responses
- Surface `client_email` in connection status (needed for GSC user setup instructions)

### Data Model
- `GscConnection` 1:1 with `Project` — `projectId` as PK (or @unique)
- Fields: `siteUrl`, `serviceAccountCiphertext`, `lastSyncAt`, `syncStatus`, `syncError`, `updatedAt`
- `syncStatus`: `'idle' | 'syncing' | 'ok' | 'failed' | 'decrypt_error'`
- Disconnect deletes connection row only — snapshots retained (Phase 2 table, not Phase 1)

### Validation
- Zod schema for SA JSON: require `type`, `client_email`, `private_key`, `project_id`
- `siteUrl` format validation: URL-prefix needs trailing slash; domain uses `sc-domain:example.com`
- On PUT: validate JSON shape → encrypt → test `sites.get` → save or return actionable error

### API Endpoints (Phase 1 only)
- `GET /api/projects/:id/gsc/connection` — status without ciphertext
- `PUT /api/projects/:id/gsc/connection` — body `{ siteUrl, serviceAccountJson }`
- `DELETE /api/projects/:id/gsc/connection` — disconnect

### Error Handling
- 403 from GSC → "Add {client_email} as user in GSC Settings"
- 404 from GSC → "Check siteUrl format (trailing slash or sc-domain: prefix)"
- Decrypt failure → set `syncStatus: 'decrypt_error'`, return status with re-upload hint
- 503 if `JHEO_SECRET_KEY` not set on write

### Patterns to Mirror
- Encryption: `routes/channels.ts` + `crypto.ts`
- Validation module: `channels-config.ts` → new `gsc-config.ts`
- Route registration: `server.ts`
- Tests: `test/routes/settings.test.ts` + `test/routes/channels.test.ts`

### the agent's Discretion
- Exact error response shape (match existing `{ error: { code, message } }` pattern)
- Whether connection test is inline on PUT or separate POST /test endpoint
- gsc-auth.ts placement of google-auth-library dependency (apps/api only)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/PROJECT.md` — F4 scope and confirmed decisions
- `.planning/REQUIREMENTS.md` — GSC-01 through GSC-06
- `.planning/research/SUMMARY.md` — stack, pitfalls, build order
- `.planning/research/PITFALLS.md` — SA-not-added, siteUrl format, decrypt errors

### Codebase Patterns
- `apps/api/src/crypto.ts` — AES-256-GCM encrypt/decrypt
- `apps/api/src/routes/channels.ts` — encrypted credential CRUD
- `apps/api/src/channels-config.ts` — Zod validation per channel type
- `apps/api/src/env.ts` — env schema (JHEO_SECRET_KEY)
- `apps/api/prisma/schema.prisma` — model conventions

### External
- [GSC Authorize Requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) — SA auth, webmasters.readonly scope
- [GSC Sites API](https://developers.google.com/webmaster-tools/v1/sites/get) — connection validation
</canonical_refs>

<specifics>
## Specific Ideas

- Migration name: `20260707XXXXXX_add_gsc_connection` (GscConnection only in Phase 1; GscSnapshot in Phase 2)
- Add `google-auth-library@10.9.0` to `apps/api/package.json` in this phase (needed for sites.get test)
- Test file: `apps/api/test/routes/gsc.test.ts` + `apps/api/test/prisma-schema-shape-gsc.test.ts`
</specifics>

<deferred>
## Deferred Ideas

- GscSnapshot table and migration — Phase 2
- BullMQ gscQueue — Phase 2
- POST /sync, GET /overview/queries/pages — Phases 2–3
- gsc-low-ctr plugin, publish hook — Phase 4
- setInterval cron — Phase 5
- Web UI — Phase 6
</deferred>

---
*Phase: 01-gsc-connection*
*Context gathered: 2026-07-07*
