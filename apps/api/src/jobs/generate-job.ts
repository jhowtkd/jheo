import type { Job } from 'bullmq';
import { runGeneration, type GenerationProviders } from '@jheo/core';
import type { PrismaClient } from '@prisma/client';
import type { EmbeddingProvider, LLMProvider } from '@jheo/core';

const SIMILARITY_THRESHOLD = 0.78;
const TOP_K = 5;

export type GenerateJobData = { generationId: string };

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
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const project = await prisma.project.findUnique({ where: { id: generation.projectId } });
    if (!project) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: 'failed' } });
      throw new Error('project not found');
    }

    const template = await prisma.generationTemplate.findUnique({ where: { id: generation.templateId } });
    if (!template) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: 'failed' } });
      throw new Error('template not found');
    }

    // 1. Embed any materials that lack an embedding.
    const materials = await prisma.material.findMany({
      where: { id: { in: generation.materialIds } },
    });
    for (const m of materials) {
      // `embedding` is `Unsupported("vector(1536)")` in the schema but Prisma's
      // generated TS type elides it from `findMany`. Use a typed view to access it.
      const embeddingPresent = (m as unknown as { embedding?: unknown }).embedding;
      if (!embeddingPresent) {
        const embedRes = await deps.embedProvider.embed({ inputs: [m.content] }, deps.fetchFn);
        const vec = embedRes.embeddings[0];
        if (!vec) continue;
        const literal = `[${vec.join(',')}]`;
        // SAFETY: m.id is a cuid generated server-side; literal is a numeric vector
        // produced from embeddings. F2.5 will switch to parameterised queries.
        await prisma.$executeRawUnsafe(
          `UPDATE "Material" SET embedding = '${literal}'::vector WHERE id = '${m.id}'`,
        );
      }
    }

    // 2. Embed user prompt + retrieve top-K.
    const qEmbedRes = await deps.embedProvider.embed({ inputs: [generation.prompt] }, deps.fetchFn);
    const qvec = qEmbedRes.embeddings[0];
    if (!qvec) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: 'failed' } });
      throw new Error('embeddings API returned no vector');
    }
    const literal = `[${qvec.join(',')}]`;
    // SAFETY: project.id is a cuid; literal is a numeric vector.
    const ranked = (await prisma.$queryRawUnsafe(
      `SELECT m.id, m.title, m.content, 1 - (m.embedding <=> '${literal}'::vector) AS score
       FROM "Material" m
       WHERE m."projectId" = '${project.id}' AND m.embedding IS NOT NULL
       ORDER BY m.embedding <=> '${literal}'::vector
       LIMIT ${TOP_K}`,
    )) as Array<{ id: string; title: string; content: string; score: number }>;
    const topK = ranked.filter((r) => r.score >= SIMILARITY_THRESHOLD);

    // 3. Run generation.
    const llmConfig = generation.llmConfig as { provider: string; model: string; temperature?: number; maxTokens?: number };
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