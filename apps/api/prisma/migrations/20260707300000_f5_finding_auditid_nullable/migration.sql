-- Drop the existing FK from Finding to Audit (CASCADE)
ALTER TABLE "Finding" DROP CONSTRAINT IF EXISTS "Finding_auditId_fkey";

-- Drop the index on auditId
DROP INDEX IF EXISTS "Finding_auditId_idx";

-- Make auditId nullable
ALTER TABLE "Finding" ALTER COLUMN "auditId" DROP NOT NULL;

-- Re-add FK as ON DELETE SET NULL (so deleting an Audit nulls the findings' auditId)
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
