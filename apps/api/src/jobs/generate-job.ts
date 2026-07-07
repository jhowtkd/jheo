import type { Job } from 'bullmq';
import { Prisma, type PrismaClient } from '@prisma/client';
import { runGeneration, type GenerationProviders } from '@jheo/core';
import type { EmbeddingProvider, LLMProvider } from '@jheo/core';

const SIMILARITY_THRESHOLD = 0.78;
const TOP_K = 5;

export type GenerateJobData = { generationId: string };

/**
 * Project-scoped material loader for a generation. The generation's
 * `projectId` is the trust boundary — a worker serving project A must never
 * surface project B's materials, even if `materialIds` is empty or wrong
 * (H-03 — cross-project isolation). This helper is exported separately from
 * the in-handler call so it can be reused by future workers (e.g. an
 * out-of-band re-embed tool) without re-implementing the project-scoped query.
 */
export async function loadMaterialsForGeneration(prisma: PrismaClient, generationId: string) {
  const gen = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { projectId: true },
  });
  return prisma.material.findMany({ where: { projectId: gen.projectId } });
}

export function makeGenerateHandler(deps: {
  prisma: PrismaClient;
  fetchFn: typeof fetch;
  embedProvider: EmbeddingProvider;
  llmProviders: Record<string, LLMProvider>;
}) {
  return async function handle(job: Job<GenerateJobData>): Promise<void> {
    const { prisma } = deps;
    const generation = await prisma.generation.findUnique({ where: { id: job.data.generationId } });
    if (!generation) return;
    // Idempotency guard: a retried BullMQ job shouldn't re-enter a completed
    // generation. Without this, retries can clobber `outputMarkdown` or flip
    // an approved `reviewState` to a transient 'running'.
    if (generation.status === 'completed' || generation.status === 'failed') return;

    // Run the status flip and the project/template lookups in parallel since
    // they only depend on the generation row and not on each other.
    const [, project, template] = await Promise.all([
      prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'running', startedAt: new Date() },
      }),
      prisma.project.findUnique({ where: { id: generation.projectId } }),
      prisma.generationTemplate.findUnique({ where: { id: generation.templateId } }),
    ]);
    if (!project) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: 'failed' } });
      throw new Error('project not found');
    }
    if (!template) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: 'failed' } });
      throw new Error('template not found');
    }

    // 1. Embed every material that lacks an embedding in a SINGLE call.
    //    The OpenAI embeddings API accepts a list; making N round-trips for
    //    N materials was the dominant cold-start cost on large projects.
    const materials = await prisma.material.findMany({
      where: { id: { in: generation.materialIds }, projectId: project.id },
    });
    const needEmbedding = materials.filter(
      (m) => !(m as unknown as { embedding?: unknown }).embedding,
    );
    if (needEmbedding.length > 0) {
      let embeddings: number[][];
      try {
        const embedRes = await deps.embedProvider.embed(
          { inputs: needEmbedding.map((m) => m.content) },
          deps.fetchFn,
        );
        embeddings = embedRes.embeddings;
      } catch (e) {
        await prisma.generation.update({
          where: { id: generation.id },
          data: { status: 'failed' },
        });
        throw e;
      }

      // Parameterised UPDATE — `$executeRawUnsafe` left us exposed to SQL
      // injection and prevented Postgres from caching the prepared statement.
      // Build a single UPDATE … FROM (VALUES …) statement so the whole batch
      // is one round-trip rather than N round-trips.
      const values = needEmbedding
        .map((m, i) => {
          const vec = embeddings[i];
          if (!vec) return null;
          const literal = `[${vec.join(',')}]`;
          return Prisma.sql`(${Prisma.raw(`'${m.id}'::text`)}, ${Prisma.raw(`'${literal}'::vector`)})`;
        })
        .filter((v): v is Prisma.Sql => v !== null);
      if (values.length > 0) {
        await prisma.$executeRaw(
          Prisma.sql`
            UPDATE "Material" AS m
            SET embedding = v.embedding::vector
            FROM (VALUES ${Prisma.join(values)}
            ) AS v(id, embedding)
            WHERE m.id = v.id
          `,
        );
      }
    }

    // 2. Embed user prompt + retrieve top-K (parameterised).
    const qEmbedRes = await deps.embedProvider.embed(
      { inputs: [generation.prompt] },
      deps.fetchFn,
    );
    const qvec = qEmbedRes.embeddings[0];
    if (!qvec) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: 'failed' },
      });
      throw new Error('embeddings API returned no vector');
    }
    const literal = `[${qvec.join(',')}]`;
    const ranked = (await prisma.$queryRaw(
      Prisma.sql`
        SELECT m.id, m.title, m.content,
               1 - (m.embedding <=> ${literal}::vector) AS score
        FROM "Material" m
        WHERE m."projectId" = ${project.id}
          AND m.embedding IS NOT NULL
        ORDER BY m.embedding <=> ${literal}::vector
        LIMIT ${TOP_K}
      `,
    )) as Array<{ id: string; title: string; content: string; score: number }>;
    const topK = ranked.filter((r) => r.score >= SIMILARITY_THRESHOLD);

    // 3. Run generation.
    const llmConfig = generation.llmConfig as {
      provider: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    };
    const providers: GenerationProviders = {
      llm: deps.llmProviders,
      embed: deps.embedProvider,
    };
    const result = await runGeneration(
      {
        prompt: generation.prompt,
        template: { prompt: template.prompt, outputSchema: template.outputSchema },
        retrievedMaterials: topK.map((r) => ({
          id: r.id,
          title: r.title,
          excerpt: r.content.slice(0, 2000),
          score: r.score,
        })),
        llmConfig,
        fetchFn: deps.fetchFn,
      },
      providers,
    );

    // 4. Persist.
    await prisma.generation.update({
      where: { id: generation.id },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        outputMarkdown: result.raw,
        outputFrontMatter: result.parsed.frontMatter as unknown as object,
        sources: result.sources as unknown as object,
        usage: result.usage as unknown as object,
      },
    });
  };
}
