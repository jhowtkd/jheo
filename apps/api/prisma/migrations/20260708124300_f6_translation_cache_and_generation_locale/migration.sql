-- 1) Add Generation.locale and Generation.translatedTo (F6 i18n)
ALTER TABLE "Generation" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Generation" ADD COLUMN "translatedTo" TEXT;

-- 2) Create TranslationCache table (F6 i18n)
CREATE TABLE "TranslationCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "targetLocale" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "translated" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranslationCache_cacheKey_key" ON "TranslationCache"("cacheKey");

-- CreateIndex
CREATE INDEX "TranslationCache_targetLocale_context_idx" ON "TranslationCache"("targetLocale", "context");
