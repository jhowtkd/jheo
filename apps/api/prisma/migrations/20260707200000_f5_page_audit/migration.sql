-- 1) Add Project.maxPages
ALTER TABLE "Project" ADD COLUMN "maxPages" INTEGER NOT NULL DEFAULT 0;

-- 2) Create PageAudit table
CREATE TABLE "PageAudit" (
    "id" TEXT NOT NULL,
    "auditId" TEXT,
    "projectPageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageAudit_auditId_idx" ON "PageAudit"("auditId");
CREATE INDEX "PageAudit_projectPageId_idx" ON "PageAudit"("projectPageId");
CREATE INDEX "PageAudit_status_idx" ON "PageAudit"("status");

ALTER TABLE "PageAudit" ADD CONSTRAINT "PageAudit_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Add Finding.pageAuditId and Finding.previousFindingId as NULLABLE
ALTER TABLE "Finding" ADD COLUMN "pageAuditId" TEXT;
ALTER TABLE "Finding" ADD COLUMN "previousFindingId" TEXT;

CREATE INDEX "Finding_pageAuditId_idx" ON "Finding"("pageAuditId");

-- 4) Backfill: for each Audit with Findings, create a synthetic ProjectPage
--    and a PageAudit, then re-link the Findings.
DO $$
DECLARE
    a          RECORD;
    syn_id     TEXT;
    pa_id      TEXT;
    target_audit_finished TIMESTAMP(3);
    target_audit_score    JSONB;
BEGIN
    FOR a IN
        SELECT DISTINCT f."auditId" AS aid
        FROM "Finding" f
        WHERE f."pageAuditId" IS NULL
    LOOP
        -- Pick the audit's finishedAt and score, or fall back to createdAt / null
        SELECT COALESCE(au."finishedAt", au."createdAt") INTO target_audit_finished
        FROM "Audit" au WHERE au."id" = a.aid;
        SELECT au."score" INTO target_audit_score
        FROM "Audit" au WHERE au."id" = a.aid;

        -- Create the synthetic ProjectPage
        syn_id := 'synthetic-' || a.aid;
        INSERT INTO "ProjectPage" ("id", "projectId", "url", "discoveredVia", "createdAt")
        SELECT syn_id, au."projectId", 'synthetic://audit/' || au."id", 'root', NOW()
        FROM "Audit" au WHERE au."id" = a.aid
        ON CONFLICT ("id") DO NOTHING;

        -- Create the PageAudit
        INSERT INTO "PageAudit" ("id", "auditId", "projectPageId", "status", "score", "finishedAt", "createdAt")
        VALUES (
            'pa-' || a.aid,
            a.aid,
            syn_id,
            'completed',
            target_audit_score,
            target_audit_finished,
            NOW()
        )
        ON CONFLICT ("id") DO NOTHING;

        -- Re-link Findings
        UPDATE "Finding" SET "pageAuditId" = 'pa-' || a.aid
        WHERE "auditId" = a.aid AND "pageAuditId" IS NULL;
    END LOOP;
END $$;

-- 5) Add the pageAuditId FK constraint now that all rows are populated
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_pageAuditId_fkey"
FOREIGN KEY ("pageAuditId") REFERENCES "PageAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) Add the FindingLineage self-FK
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_previousFindingId_fkey"
FOREIGN KEY ("previousFindingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) Add the PageAudit → ProjectPage FK
ALTER TABLE "PageAudit" ADD CONSTRAINT "PageAudit_projectPageId_fkey"
FOREIGN KEY ("projectPageId") REFERENCES "ProjectPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) Make Finding.pageAuditId NOT NULL now that all rows have it
ALTER TABLE "Finding" ALTER COLUMN "pageAuditId" SET NOT NULL;
