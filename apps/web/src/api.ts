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
