// Public API of @jheo/core. Only the value-level exports actually
// consumed by apps/api and apps/web are re-exported — types from `./types.js`
// are kept because they're part of the public inference surface.
export * from './types.js';
export {
  LOCALE_NAMES,
  negotiateLocale,
  localeDisplayName,
  type SupportedLocale,
} from './i18n/locale.js';
export { runAudit } from './audit/orchestrator.js';
export {
  OpenAIProvider,
} from './llm/openai.js';
export {
  AnthropicProvider,
} from './llm/anthropic.js';
export {
  OpenRouterProvider,
} from './llm/openrouter.js';
export {
  OpenAIEmbeddingProvider,
} from './llm/embeddings.js';
export type {
  LLMProvider,
  EmbeddingProvider,
  LLMRequest,
  LLMResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from './llm/types.js';
export {
  runGeneration,
  buildSystemPrompt,
  stripLlmThinking,
  type RetrievedMaterial,
  type GenerationContext,
  type GenerationResult,
  type GenerationProviders,
} from './generation/index.js';
export {
  aggregateReviewState,
} from './distribution/aggregate.js';
export type {
  Publisher,
  PublishStatus,
  PublishRequest,
  PublishResult,
} from './distribution/types.js';
export {
  WordPressPublisher,
} from './distribution/wordpress.js';
export {
  HttpPublisher,
} from './distribution/http.js';
export {
  AgentPublisher,
} from './distribution/agent.js';
export {
  createGscClient,
  fetchSearchAnalyticsDay,
  fetchSearchAnalyticsRange,
  formatGscDate,
  inspectUrl,
  parseSnapshotRow,
  GSC_SNAPSHOT,
  lookupGscPageMetrics,
  normalizeGscPageUrl,
  type GscPageMetrics,
  type GscSnapshotContext,
  type GscClient,
  type GscClientDeps,
  type GscSnapshotRow,
  type SearchAnalyticsRequest,
  type UrlInspectionRequest,
  type UrlInspectionResult,
} from './gsc/index.js';
export * from './suggestions/index.js';
export {
  AuditSummarySchema,
  ExecutiveNarrativeSchema,
  type AuditSummary,
  type GscReportSummary,
  type ExecutiveNarrative,
  type ExecutiveReportRecord,
  type TopRuleSummary,
} from './reports/index.js';
