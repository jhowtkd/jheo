-- CreateTable
CREATE TABLE "PublishEvent" (
    "id" TEXT NOT NULL,
    "publishId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishEvent_publishId_idx" ON "PublishEvent"("publishId");

-- CreateIndex
CREATE INDEX "PublishEvent_createdAt_idx" ON "PublishEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "PublishEvent" ADD CONSTRAINT "PublishEvent_publishId_fkey" FOREIGN KEY ("publishId") REFERENCES "Publish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
