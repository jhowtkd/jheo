-- HNSW index on Material.embedding for KNN-style retrieval in
-- generate-job.ts. Without this, the cosine-distance scan
-- (`ORDER BY m.embedding <=> $1::vector`) runs a full sequential scan and
-- becomes the bottleneck past a few thousand materials per project.
--
-- pgvector >= 0.5 supports HNSW natively. If you're running on an older
-- pgvector, swap the USING clause for ivfflat (the trade-off is slower
-- inserts but smaller index footprint).
--
-- The IF NOT EXISTS guards make this safe to re-run on subsequent container
-- starts (init scripts under /docker-entrypoint-initdb.d only run once,
-- but the api may re-apply on `prisma migrate deploy` etc).
CREATE INDEX IF NOT EXISTS material_embedding_hnsw
  ON "Material"
  USING hnsw (embedding vector_cosine_ops);
