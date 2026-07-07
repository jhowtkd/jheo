import { prisma } from './db.js';

/**
 * Idempotent Postgres bootstrap — runs the CREATE EXTENSION for pgvector
 * (in case the database was provisioned without /docker-entrypoint-initdb.d)
 * and creates the HNSW index on Material.embedding used by the generation
 * KNN retrieval. Safe to call repeatedly; uses IF NOT EXISTS everywhere.
 */
export async function ensureDatabaseReady(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
  } catch {
    // pgvector requires the OS-level extension; in production we assume the
    // pgvector docker image already provides it. Ignore.
  }
  try {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS material_embedding_hnsw ' +
        'ON "Material" USING hnsw (embedding vector_cosine_ops)',
    );
  } catch (e) {
    // pgvector < 0.5 doesn't support HNSW. Fall back to ivfflat only if the
    // HNSW statement failed for the exact "operator class not found" reason.
    const msg = (e as Error).message ?? '';
    if (/does not exist|operator class/i.test(msg)) {
      try {
        await prisma.$executeRawUnsafe(
          'CREATE INDEX IF NOT EXISTS material_embedding_ivfflat ' +
            'ON "Material" USING ivfflat (embedding vector_cosine_ops) ' +
            'WITH (lists = 100)',
        );
      } catch {
        // If even ivfflat is unavailable, the table will fall back to seq
        // scan. Log and continue rather than fail boot.
      }
    }
  }
}
