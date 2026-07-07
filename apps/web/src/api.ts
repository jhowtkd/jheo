const API = '/api';

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
  const r = await fetch(`${API}/projects`);
  return r.json();
}
export async function createProject(input: { domain: string }): Promise<Project> {
  const r = await fetch(`${API}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export type PageScore = { overall: number; byCategory: Record<string, number | null> };

export type ProjectPage = {
  id: string;
  url: string;
  discoveredVia: 'root' | 'sitemap' | 'crawl';
  lastAuditedAt: string | null;
  lastScore?: PageScore | null; // populated by /pages route; not by /:id
};

export type PagesResponse = {
  total: number;
  limit: number;
  offset: number;
  items: ProjectPage[];
};

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
  return (await fetch(`${API}/projects/${id}`)).json();
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
  const res = await fetch(`${API}/projects/${id}/pages${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to load pages: ${res.status}`);
  return res.json();
}
export async function getProjectHealth(id: string): Promise<ProjectHealth> {
  const res = await fetch(`${API}/projects/${id}/health`);
  if (!res.ok) throw new Error(`Failed to load health: ${res.status}`);
  return res.json();
}
export async function runAudit(projectId: string): Promise<Audit> {
  const r = await fetch(`${API}/audits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, config: {} }),
  });
  return r.json();
}
export async function getAudit(id: string): Promise<Audit & { findings: Finding[] }> {
  const r = await fetch(`${API}/audits/${id}`);
  return r.json();
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
  const res = await fetch(`${API}/audits/${auditId}/progress`);
  if (!res.ok) throw new Error(`Failed to load progress: ${res.status}`);
  return res.json();
}

export async function cancelAudit(auditId: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API}/audits/${auditId}`, { method: 'DELETE' });
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
  return (await fetch(`/api/projects/${projectId}/materials`)).json();
}
export async function createMaterial(
  projectId: string,
  input: { type: 'url' | 'file' | 'note'; title: string; source: string },
): Promise<{ id: string; deduped?: boolean }> {
  const r = await fetch(`/api/projects/${projectId}/materials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function deleteMaterial(id: string): Promise<{ id: string }> {
  return (await fetch(`/api/materials/${id}`, { method: 'DELETE' })).json();
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
  return (await fetch('/api/templates')).json();
}
export async function getTemplate(id: string): Promise<GenerationTemplate> {
  return (await fetch(`/api/templates/${id}`)).json();
}
export async function createTemplate(input: {
  name: string;
  prompt: string;
  outputSchema: unknown;
}): Promise<GenerationTemplate> {
  const r = await fetch('/api/templates', {
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
  const r = await fetch(`/api/templates/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function activateTemplate(id: string): Promise<GenerationTemplate> {
  const r = await fetch(`/api/templates/${id}/active`, { method: 'PATCH' });
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
};
export async function listGenerations(projectId: string): Promise<Generation[]> {
  return (await fetch(`/api/projects/${projectId}/generations`)).json();
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
  const r = await fetch(`/api/projects/${projectId}/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function getGeneration(id: string): Promise<Generation> {
  return (await fetch(`/api/generations/${id}`)).json();
}
export async function reviewGeneration(
  id: string,
  action: 'send_to_review' | 'approve' | 'reject',
  notes?: string,
): Promise<Generation> {
  const r = await fetch(`/api/generations/${id}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, notes }),
  });
  return r.json();
}
export async function editGenerationMarkdown(id: string, outputMarkdown: string): Promise<Generation> {
  const r = await fetch(`/api/generations/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ outputMarkdown }),
  });
  return r.json();
}

// ---------- Settings ----------
export type Setting = { key: string; updatedAt: string };
export async function listSettings(): Promise<Setting[]> {
  return (await fetch('/api/settings')).json();
}
export async function upsertSetting(key: string, value: string): Promise<Setting> {
  const r = await fetch(`/api/settings/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return r.json();
}
export async function deleteSetting(key: string): Promise<{ key: string }> {
  return (await fetch(`/api/settings/${key}`, { method: 'DELETE' })).json();
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
  return (await fetch(`/api/projects/${projectId}/channels`)).json();
}
export async function createChannel(
  projectId: string,
  input: { name: string; type: ChannelType; config: unknown; isActive?: boolean },
): Promise<{ id: string }> {
  const r = await fetch(`/api/projects/${projectId}/channels`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function getChannel(id: string): Promise<ChannelDetail> {
  return (await fetch(`/api/channels/${id}`)).json();
}
export async function updateChannel(
  id: string,
  input: { name?: string; config?: unknown; isActive?: boolean },
): Promise<Channel> {
  const r = await fetch(`/api/channels/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function deleteChannel(id: string): Promise<{ id: string }> {
  return (await fetch(`/api/channels/${id}`, { method: 'DELETE' })).json();
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
  return (await fetch(`/api/generations/${generationId}/publishes`)).json();
}
export async function createPublishes(generationId: string, channelIds: string[]): Promise<{ publishes: string[] }> {
  const r = await fetch(`/api/generations/${generationId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channelIds }),
  });
  return r.json();
}
export async function retryPublish(id: string): Promise<{ id: string }> {
  return (await fetch(`/api/publishes/${id}/retry`, { method: 'POST' })).json();
}
export async function cancelPublish(id: string): Promise<{ id: string }> {
  return (await fetch(`/api/publishes/${id}/cancel`, { method: 'POST' })).json();
}
export async function getPublish(id: string): Promise<Publish> {
  return (await fetch(`/api/publishes/${id}`)).json();
}
export async function getPublishFiles(id: string): Promise<{ dir: string; files: { name: string; content: string }[] }> {
  return (await fetch(`/api/publishes/${id}/files`)).json();
}
