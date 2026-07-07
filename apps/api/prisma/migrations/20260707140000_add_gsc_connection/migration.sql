-- CreateTable
CREATE TABLE "GscConnection" (
    "projectId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "serviceAccountCiphertext" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "syncError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GscConnection_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "GscConnection" ADD CONSTRAINT "GscConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
