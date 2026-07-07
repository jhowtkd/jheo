-- CreateTable
CREATE TABLE "GscSnapshot" (
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "query" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "device" TEXT NOT NULL DEFAULT 'DESKTOP',
    "country" TEXT NOT NULL DEFAULT 'usa',
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GscSnapshot_pkey" PRIMARY KEY ("projectId","date","query","page","device","country")
);

-- CreateIndex
CREATE INDEX "GscSnapshot_projectId_date_idx" ON "GscSnapshot"("projectId", "date");

-- AddForeignKey
ALTER TABLE "GscSnapshot" ADD CONSTRAINT "GscSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
