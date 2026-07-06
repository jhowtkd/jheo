const API = '/api';

export type Project = { id: string; name: string; rootUrl: string; createdAt: string };
export type Audit = {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  score?: { overall: number; byCategory: Record<string, number | null> } | null;
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
export async function createProject(input: { name: string; rootUrl: string }): Promise<Project> {
  const r = await fetch(`${API}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
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
