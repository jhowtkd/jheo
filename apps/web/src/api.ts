import type { AuditSummary, ExecutiveNarrative } from '@jheo/core';
import { i18n } from './i18n';
import { readJsonOrThrow } from './api/readJsonOrThrow.js';

const API = '/api';

// Wrapper that injects Accept-Language on every fetch from the SPA. We
// resolve `globalThis.fetch` lazily so tests can stub it (e.g. the
// useDataTranslations suite replaces `globalThis.fetch` with a mock).
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

const localeFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has('accept-language')) {
    headers.set('accept-language', i18n.language || 'en');
  }
  const signal =
    init?.signal ??
    (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS)
      : undefined);
  return globalThis.fetch(input as RequestInfo | URL, { ...init, headers, ...(signal ? { signal } : {}) });
};

export { humanError, type HumanError } from './api/errors.js';

export type Project = { id: string; name: string; rootUrl: string; createdAt: string };
export type Audit = {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string | null;
  finishedAt: string | null;
  score?: {
    overall: number;
    byCategory: Record<string, number | null>;
    pagesAudited?: number;
    discoveryLimitReached?: boolean;
  } | null;
};
export type Finding = {
  id: string;
  auditId: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  rule: string;
  message: string;
  url: string;
  selector?: string | null;
};

export async function listProjects(): Promise<Project[]> {
  const r = await localeFetch(`${API}/projects`);
  return readJsonOrThrow(r, 'projects');
}
export async function createProject(input: { domain: string }): Promise<Project> {
  const r = await localeFetch(`${API}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow(r, 'projects');
}
export type PageScore = { overall: number; byCategory: Record<string, number | null> };

export type ProjectPage = {
  id: string;
  url: string;
  discoveredVia: 'root' | 'sitemap' | 'crawl';
  lastAuditedAt: string | null;
  lastScore?: PageScore | null;
};

export type PagesResponse = {
  total: number;
  limit: number;
  offset: number;
  items: ProjectPage[];
};

// ---------- Re-audit + diff (F5.4) ----------
export type FindingDiff = 'NEW' | 'UNCHANGED' | 'IMPROVEMENT' | 'REGRESSION';

export type FindingWithDiff = {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  rule: string;
  message: string;
  url: string;
  selector: string | null;
  evidence: Record<string, unknown>;
  previousFindingId: string | null;
  diff: FindingDiff;
};

export type PageAuditDetail = {
  id: string;
  projectPageId: string;
  url: string;
  status: string;
  score: { overall: number; byCategory: Record<string, number | null> } | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  findings: FindingWithDiff[];
  fixed: Array<{ id: string; category: string; severity: string; rule: string; message: string; url: string }>;
};

export async function reAuditPage(pageId: string): Promise<{ pageAuditId: string }> {
  const res = await localeFetch(`${API}/pages/${pageId}/audit`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Re-audit failed: ${res.status}`);
  }
  return res.json();
}

export async function getPageAuditDetail(pageAuditId: string): Promise<PageAuditDetail> {
  const res = await localeFetch(`${API}/page-audits/${pageAuditId}`);
  if (!res.ok) throw new Error(`Failed to load page audit: ${res.status}`);
  return res.json();
}

export type ProjectHealth = {
  overall: number | null;
  byCategory: Record<'seo' | 'cwv' | 'geo' | 'a11y' | 'content', number | null>;
  pagesAudited: number;
  pagesTotal: number;
  pagesWithError: number;
  lastAuditAt: string | null;
};

export type ProjectDetail = Project & { audits: Audit[]; pages: ProjectPage[] };
export async function getProject(id: string): Promise<ProjectDetail> {
  const r = await localeFetch(`${API}/projects/${id}`);
  return readJsonOrThrow(r, 'project');
}
export async function getProjectPages(
  id: string,
  opts: { limit?: number; offset?: number; filter?: string } = {},
): Promise<PagesResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.filter) params.set('filter', opts.filter);
  const qs = params.toString();
  const res = await localeFetch(`${API}/projects/${id}/pages${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to load pages: ${res.status}`);
  return res.json();
}
export async function getProjectHealth(id: string): Promise<ProjectHealth> {
  const res = await localeFetch(`${API}/projects/${id}/health`);
  if (!res.ok) throw new Error(`Failed to load health: ${res.status}`);
  return res.json();
}
export type AuditListItem = {
  id: string;
  projectId: string;
  projectName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  score: Audit['score'];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export async function listAudits(limit = 50): Promise<AuditListItem[]> {
  const r = await localeFetch(`${API}/audits?limit=${limit}`);
  return readJsonOrThrow<AuditListItem[]>(r);
}

export async function runAudit(
  projectId: string,
  config: Record<string, unknown> = {},
): Promise<Audit> {
  const r = await localeFetch(`${API}/audits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, config }),
  });
  return readJsonOrThrow(r, 'audits');
}
export async function getAudit(id: string): Promise<Audit & { findings: Finding[] }> {
  const r = await localeFetch(`${API}/audits/${id}`);
  return readJsonOrThrow(r, 'audit');
}

export type AuditProgress = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  pagesTotal: number;
  pagesCompleted: number;
  pagesFailed: number;
  pagesSkipped: number;
  currentPages: string[];
};

export async function getAuditProgress(auditId: string): Promise<AuditProgress> {
  const res = await localeFetch(`${API}/audits/${auditId}/progress`);
  if (!res.ok) throw new Error(`Failed to load progress: ${res.status}`);
  return res.json();
}

export async function cancelAudit(auditId: string): Promise<{ id: string; status: string }> {
  const res = await localeFetch(`${API}/audits/${auditId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to cancel: ${res.status}`);
  return res.json();
}

// ---------- Materials ----------
export type Material = {
  id: string;
  type: string;
  title: string;
  embeddingStatus: 'pending' | 'ready';
  charCount: number;
  createdAt: string;
};
export async function listMaterials(projectId: string): Promise<Material[]> {
  return (await localeFetch(`/api/projects/${projectId}/materials`)).json();
}
export async function createMaterial(
  projectId: string,
  input: { type: 'url' | 'file' | 'note'; title: string; source: string },
): Promise<{ id: string; deduped?: boolean }> {
  const r = await localeFetch(`/api/projects/${projectId}/materials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function deleteMaterial(id: string): Promise<{ id: string }> {
  return (await localeFetch(`/api/materials/${id}`, { method: 'DELETE' })).json();
}

// ---------- Templates ----------
export type GenerationTemplate = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  prompt: string;
  outputSchema: unknown;
  createdAt: string;
};
export async function listTemplates(): Promise<GenerationTemplate[]> {
  return (await localeFetch('/api/templates')).json();
}
export async function getTemplate(id: string): Promise<GenerationTemplate> {
  return (await localeFetch(`/api/templates/${id}`)).json();
}
export async function createTemplate(input: {
  name: string;
  prompt: string;
  outputSchema: unknown;
}): Promise<GenerationTemplate> {
  const r = await localeFetch('/api/templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function updateTemplate(
  id: string,
  input: { prompt: string; outputSchema: unknown },
): Promise<GenerationTemplate> {
  const r = await localeFetch(`/api/templates/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function activateTemplate(id: string): Promise<GenerationTemplate> {
  const r = await localeFetch(`/api/templates/${id}/active`, { method: 'PATCH' });
  return r.json();
}

// ---------- Generations ----------
export type Generation = {
  id: string;
  projectId: string;
  templateId: string;
  prompt: string;
  materialIds: string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  reviewState: 'draft' | 'in_review' | 'approved';
  outputMarkdown: string | null;
  outputFrontMatter: unknown;
  sources: Array<{ id: string; score: number; excerpt: string }>;
  usage: { promptTokens: number; completionTokens: number; provider: string; model: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  locale: string;
  translatedTo?: string | null;
};
export async function listGenerations(projectId: string): Promise<Generation[]> {
  return (await localeFetch(`/api/projects/${projectId}/generations`)).json();
}
export async function createGeneration(
  projectId: string,
  input: {
    prompt: string;
    templateId: string;
    materialIds: string[];
    llmConfig: { provider: 'openai' | 'anthropic' | 'openrouter'; model: string; temperature?: number; maxTokens?: number };
  },
): Promise<Generation> {
  const r = await localeFetch(`/api/projects/${projectId}/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function getGeneration(id: string): Promise<Generation> {
  return (await localeFetch(`/api/generations/${id}`)).json();
}
export async function reviewGeneration(
  id: string,
  action: 'send_to_review' | 'approve' | 'reject',
  notes?: string,
): Promise<Generation> {
  const r = await localeFetch(`/api/generations/${id}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, notes }),
  });
  return r.json();
}
export async function editGenerationMarkdown(id: string, outputMarkdown: string): Promise<Generation> {
  const r = await localeFetch(`/api/generations/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outputMarkdown }),
  });
  return r.json();
}

// ---------- Settings ----------
export type Setting = { key: string; updatedAt: string };
export async function listSettings(): Promise<Setting[]> {
  return (await localeFetch('/api/settings')).json();
}
export async function upsertSetting(key: string, value: string): Promise<Setting> {
  const r = await localeFetch(`/api/settings/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return r.json();
}
export async function deleteSetting(key: string): Promise<{ key: string }> {
  return (await localeFetch(`/api/settings/${key}`, { method: 'DELETE' })).json();
}

// ---------- Channels ----------
export type ChannelType = 'wordpress' | 'http' | 'agent';
export type Channel = {
  id: string;
  projectId: string;
  type: ChannelType;
  name: string;
  isActive: boolean;
  createdAt: string;
};
export type ChannelDetail = Channel & { config: unknown };
export async function listChannels(projectId: string): Promise<Channel[]> {
  return (await localeFetch(`/api/projects/${projectId}/channels`)).json();
}
export async function createChannel(
  projectId: string,
  input: { name: string; type: ChannelType; config: unknown; isActive?: boolean },
): Promise<{ id: string }> {
  const r = await localeFetch(`/api/projects/${projectId}/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function getChannel(id: string): Promise<ChannelDetail> {
  return (await localeFetch(`/api/channels/${id}`)).json();
}
export async function updateChannel(
  id: string,
  input: { name?: string; config?: unknown; isActive?: boolean },
): Promise<Channel> {
  const r = await localeFetch(`/api/channels/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function deleteChannel(id: string): Promise<Channel> {
  return (await localeFetch(`/api/channels/${id}`, { method: 'DELETE' })).json();
}

// ---------- Publishes ----------
export type PublishStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type PublishEvent = {
  id: string;
  fromStatus: PublishStatus | null;
  toStatus: PublishStatus;
  message: string | null;
  createdAt: string;
};
export type Publish = {
  id: string;
  generationId: string;
  channelId: string;
  status: PublishStatus;
  attempts: number;
  externalId: string | null;
  externalUrl: string | null;
  response: unknown;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  channel?: { type: 'wordpress' | 'http' | 'agent'; name: string };
  events?: PublishEvent[];
};
export async function listPublishes(generationId: string): Promise<Publish[]> {
  return (await localeFetch(`/api/generations/${generationId}/publishes`)).json();
}
export async function createPublishes(generationId: string, channelIds: string[]): Promise<{ publishes: string[] }> {
  const r = await localeFetch(`/api/generations/${generationId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channelIds }),
  });
  return r.json();
}
export async function retryPublish(id: string): Promise<{ id: string }> {
  return (await localeFetch(`/api/publishes/${id}/retry`, { method: 'POST' })).json();
}
export async function cancelPublish(id: string): Promise<{ id: string }> {
  return (await localeFetch(`/api/publishes/${id}/cancel`, { method: 'POST' })).json();
}
export async function getPublish(id: string): Promise<Publish> {
  return (await localeFetch(`/api/publishes/${id}`)).json();
}
export async function getPublishFiles(id: string): Promise<{ dir: string; files: { name: string; content: string }[] }> {
  return (await localeFetch(`/api/publishes/${id}/files`)).json();
}

// ---------- Google Search Console ----------
export type GscConnection = {
  projectId: string;
  siteUrl: string;
  lastSyncAt: string | null;
  syncStatus: string;
  syncError: string | null;
  clientEmail: string | null;
};

export type GscFreshness = {
  lastSyncedAt: string | null;
  syncStatus: string;
  syncError: string | null;
  dataThrough: string;
  days: number;
};

export type GscOverview = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  rowCount: number;
  freshness: GscFreshness;
};

export type GscMetricRow = {
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function getGscConnection(projectId: string): Promise<GscConnection | null> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/connection`);
  if (r.status === 404) return null;
  return readJsonOrThrow<GscConnection>(r);
}

export async function putGscConnection(
  projectId: string,
  input: { siteUrl: string; serviceAccountJson: unknown },
): Promise<GscConnection> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/connection`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<GscConnection>(r);
}

export async function deleteGscConnection(projectId: string): Promise<{ projectId: string }> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/connection`, { method: 'DELETE' });
  return readJsonOrThrow(r);
}

export async function syncGsc(projectId: string): Promise<{ status: string; freshness: GscFreshness }> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/sync`, { method: 'POST' });
  return readJsonOrThrow(r);
}

export async function getGscOverview(projectId: string, days = 28): Promise<GscOverview> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/overview?days=${days}`);
  return readJsonOrThrow<GscOverview>(r);
}

export async function getGscQueries(projectId: string, days = 28, limit = 10): Promise<{ rows: GscMetricRow[]; freshness: GscFreshness }> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/queries?days=${days}&limit=${limit}`);
  return readJsonOrThrow(r);
}

export async function getGscPages(projectId: string, days = 28, limit = 10): Promise<{ rows: GscMetricRow[]; freshness: GscFreshness }> {
  const r = await localeFetch(`/api/projects/${projectId}/gsc/pages?days=${days}&limit=${limit}`);
  return readJsonOrThrow(r);
}

export async function translateTexts(
  texts: string[],
  context: 'finding' | 'generation' | 'material' | 'help',
): Promise<Array<{ original: string; translated: string; cached: boolean }>> {
  if (texts.length === 0) return [];
  const targetLocale = i18n.language === 'pt-BR' ? 'pt-BR' : 'en';

  // ponytail: chunk to stay under Fastify's 1 MB bodyLimit — long-form
  // content (generations/materials) with 50 texts can easily overflow it.
  const BATCH = 10;
  const results: Array<{ original: string; translated: string; cached: boolean }> = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await localeFetch('/api/translate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-language': targetLocale,
        },
        body: JSON.stringify({ texts: batch, targetLocale, context }),
      });
      if (res.status !== 429) break;
      const retryAfterSec = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfterSec) * 1000));
    }
    if (!res!.ok) {
      if (res!.status === 503) {
        const errBody = await res!.json().catch(() => null);
        if (errBody?.error === 'backend_unavailable') throw new Error('backend_unavailable');
        throw new Error('no_llm_provider');
      }
      if (res!.status === 429) throw new Error('rate_limited');
      throw new Error(`translate failed: ${res!.status}`);
    }
    const body = await res!.json();
    results.push(...body.translations);
  }
  return results;
}

// ---------- F7: suggestions ----------

export type SuggestionConfidence = 'low' | 'medium' | 'high';
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';
export type SuggestionLocale = 'en' | 'pt-BR';

export type Suggestion = {
  id: string;
  findingId: string;
  kind: string;
  category: string;
  before: string;
  after: string;
  confidence: SuggestionConfidence;
  rationale: string;
  locale: SuggestionLocale;
  status: SuggestionStatus;
  model: string;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
};

export type CreateSuggestionInput = {
  findingId: string;
  locale?: SuggestionLocale;
};

export type AcceptSuggestionResult = {
  suggestion: Suggestion;
  reAuditId: string | null;
};

export async function createSuggestion(input: CreateSuggestionInput): Promise<Suggestion> {
  return (await localeFetch('/api/suggestions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }).then((r) => r.json())) as Suggestion;
}

export async function listSuggestions(findingId: string): Promise<Suggestion[]> {
  return (await localeFetch(`/api/suggestions?findingId=${encodeURIComponent(findingId)}`).then((r) => r.json())) as Suggestion[];
}

/** One round-trip for all suggestions belonging to findings of an audit. */
export async function listSuggestionsByAudit(auditId: string): Promise<Suggestion[]> {
  return (await localeFetch(`/api/suggestions?auditId=${encodeURIComponent(auditId)}`).then((r) => r.json())) as Suggestion[];
}

export async function getSuggestion(id: string): Promise<Suggestion> {
  return (await localeFetch(`/api/suggestions/${id}`).then((r) => r.json())) as Suggestion;
}

export async function acceptSuggestion(id: string): Promise<AcceptSuggestionResult> {
  return (await localeFetch(`/api/suggestions/${id}/accept`, { method: 'POST' }).then((r) => r.json())) as AcceptSuggestionResult;
}

export async function rejectSuggestion(id: string): Promise<Suggestion> {
  return (await localeFetch(`/api/suggestions/${id}/reject`, { method: 'POST' }).then((r) => r.json())) as Suggestion;
}

// ---------- Executive report (F8) ----------
export type ExecutiveReportResponse = {
  status: 'generating' | 'ready' | 'failed';
  locale: string;
  generatedAt: string | null;
  model: string | null;
  errorMessage: string | null;
  aggregates: AuditSummary;
  narrative: ExecutiveNarrative | null;
};

export async function getExecutiveReport(auditId: string): Promise<ExecutiveReportResponse> {
  const r = await localeFetch(`${API}/audits/${auditId}/executive-report`);
  if (r.status === 202) return r.json();
  if (!r.ok) throw new Error(`Failed to load executive report: ${r.status}`);
  return r.json();
}

export function executiveReportExportUrl(auditId: string): string {
  return `${API}/audits/${auditId}/executive-report/export`;
}
