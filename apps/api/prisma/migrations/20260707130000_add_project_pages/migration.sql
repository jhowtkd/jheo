CREATE TABLE "ProjectPage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "discoveredVia" TEXT NOT NULL,
    "lastAuditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectPage_projectId_url_key" ON "ProjectPage"("projectId", "url");
CREATE INDEX "ProjectPage_projectId_idx" ON "ProjectPage"("projectId");

ALTER TABLE "ProjectPage" ADD CONSTRAINT "ProjectPage_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
