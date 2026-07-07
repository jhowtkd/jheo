import type { LLMProvider, LLMResponse, EmbeddingProvider, LLMRequest } from '../llm/types.js';
import { parseMarkdownWithFrontmatter } from './parse.js';
import type { ParsedMarkdown } from './schema.js';
import { stringify as yamlStringify } from 'yaml';

export interface RetrievedMaterial {
  id: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface GenerationContext {
  prompt: string;
  template: { prompt: string; outputSchema: unknown };
  retrievedMaterials: RetrievedMaterial[];
  llmConfig: { provider: string; model: string; temperature?: number; maxTokens?: number };
  fetchFn: typeof fetch;
  signal?: AbortSignal;
}

export interface GenerationResult {
  parsed: ParsedMarkdown;
  raw: string;
  sources: { id: string; score: number; excerpt: string }[];
  usage: LLMResponse['usage'];
}

export interface GenerationProviders {
  llm: Record<string, LLMProvider>;
  embed: EmbeddingProvider;
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => {
    if (!(key in vars)) throw new Error(`unresolved template placeholder {{${key}}}`);
    return vars[key]!;
  });
}

function buildPrompt(ctx: GenerationContext): { prompt: string; system?: string } {
  const sourcesJson = JSON.stringify(
    ctx.retrievedMaterials.map((m) => ({ id: m.id, title: m.title, excerpt: m.excerpt })),
  );
  const schemaDesc =
    typeof ctx.template.outputSchema === 'string'
      ? ctx.template.outputSchema
      : JSON.stringify(ctx.template.outputSchema);
  const prompt = substitute(ctx.template.prompt, {
    userPrompt: ctx.prompt,
    sources: sourcesJson,
    outputSchemaDescription: schemaDesc,
  });
  return { prompt };
}

const CORRECTIVE_SUFFIX =
  '\n\n---\nIMPORTANT: your previous response failed schema validation. Re-emit valid YAML frontmatter and body matching the schema exactly.';

function buildConfig(
  model: string,
  temperature: number | undefined,
  maxTokens: number | undefined,
): { model: string; temperature?: number; maxTokens?: number } {
  const cfg: { model: string; temperature?: number; maxTokens?: number } = { model };
  if (temperature !== undefined) cfg.temperature = temperature;
  if (maxTokens !== undefined) cfg.maxTokens = maxTokens;
  return cfg;
}

export async function runGeneration(
  ctx: GenerationContext,
  providers: GenerationProviders,
): Promise<GenerationResult> {
  const provider = providers.llm[ctx.llmConfig.provider];
  if (!provider) throw new Error(`unknown LLM provider: ${ctx.llmConfig.provider}`);

  const { prompt: firstPrompt, system } = buildPrompt(ctx);
  const req1: LLMRequest = { prompt: firstPrompt, config: buildConfig(ctx.llmConfig.model, ctx.llmConfig.temperature, ctx.llmConfig.maxTokens) };
  if (system !== undefined) req1.system = system;
  if (ctx.signal !== undefined) req1.signal = ctx.signal;

  const r1 = await provider.complete(req1, ctx.fetchFn);
  const p1 = parseMarkdownWithFrontmatter(r1.text);
  if (p1.ok && p1.parsed) {
    return {
      parsed: p1.parsed,
      // Persist the cleaned text (think block + code fences stripped) so
      // downstream consumers (UI markdown render, exports) don't surface
      // the model's chain-of-thought.
      raw: serializeMarkdown(p1.parsed),
      sources: ctx.retrievedMaterials.map((m) => ({ id: m.id, score: m.score, excerpt: m.excerpt })),
      usage: r1.usage,
    };
  }

  // Retry once with corrective suffix.
  const req2: LLMRequest = {
    prompt: r1.text + CORRECTIVE_SUFFIX,
    config: buildConfig(ctx.llmConfig.model, ctx.llmConfig.temperature, ctx.llmConfig.maxTokens),
  };
  if (ctx.signal !== undefined) req2.signal = ctx.signal;

  const r2 = await provider.complete(req2, ctx.fetchFn);
  const p2 = parseMarkdownWithFrontmatter(r2.text);
  if (!p2.ok || !p2.parsed) {
    throw new Error(
      `generation parse failed twice: first=${p1.error}:${p1.detail}; second=${p2.error}:${p2.detail}`,
    );
  }
  return {
    parsed: p2.parsed,
    raw: serializeMarkdown(p2.parsed),
    sources: ctx.retrievedMaterials.map((m) => ({ id: m.id, score: m.score, excerpt: m.excerpt })),
    usage: r2.usage,
  };
}

/**
 * Reconstruct a clean `--- frontmatter ---\nbody` markdown string from a
 * parsed result. Used as the persisted `outputMarkdown` so consumers don't
 * have to know about the think-block stripping the parser does upstream.
 */
function serializeMarkdown(p: ParsedMarkdown): string {
  const fm = yamlStringify(p.frontMatter).trimEnd();
  return `---\n${fm}\n---\n\n${p.body}`;
}