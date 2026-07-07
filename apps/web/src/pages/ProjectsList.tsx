import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject, listProjects } from '../api.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty">
      <div className="empty__art">
        <svg viewBox="0 0 56 56">
          <rect x="8" y="14" width="40" height="32" rx="3" />
          <path d="M8 22h40" />
          <path d="M14 14V8" />
          <path d="M42 14V8" />
          <circle cx="20" cy="32" r="2" />
          <path d="M28 32h12" />
          <path d="M28 38h8" />
        </svg>
      </div>
      <p className="empty__title">No projects yet</p>
      <p className="empty__hint">
        Create your first project to start auditing a site. Each project owns its audits,
        materials, generations, and distribution channels.
      </p>
      <button className="btn btn--primary empty__action" onClick={onNew}>
        Create project
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="col" style={{ gap: 'var(--space-3)' }}>
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--card" />
    </div>
  );
}

export function ProjectsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('https://');
  const create = useMutation({
    mutationFn: (input: { name: string; rootUrl: string }) =>
      createProject({ domain: input.rootUrl }).then((p) => ({ ...p, name: input.name })),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/projects/${p.id}`);
    },
  });

  const focusNew = () => (document.getElementById('new-project-name') as HTMLInputElement | null)?.focus();

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Projects</h1>
          <p className="page__subtitle">
            Audit, generate, and distribute GEO &amp; SEO content per site. Each project tracks its own
            findings, materials, generations, and publish history.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card__title">New project</div>
        <p className="tiny" style={{ marginTop: 'var(--space-1)', marginBottom: 'var(--space-4)' }}>
          Give it a name and the root URL to audit.
        </p>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name, rootUrl });
            setName('');
          }}
        >
          <input
            id="new-project-name"
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Marketing"
          />
          <input
            className="input"
            required
            value={rootUrl}
            onChange={(e) => setRootUrl(e.target.value)}
            placeholder="https://acme.com"
          />
          <button className="btn btn--primary" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </button>
        </form>
        {create.isError && (
          <p className="tiny" style={{ color: 'var(--danger)', marginTop: 'var(--space-3)' }}>
            {(create.error as Error).message}
          </p>
        )}
      </div>

      {projects.isLoading && <LoadingSkeleton />}

      {projects.data && projects.data.length === 0 && !projects.isLoading && (
        <EmptyState onNew={focusNew} />
      )}

      {projects.data && projects.data.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Name</th>
                <th>Root URL</th>
                <th style={{ width: 120, textAlign: 'right' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.data.map((p) => (
                <tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <td>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </td>
                  <td className="mono tiny">{p.rootUrl}</td>
                  <td className="tiny tabular" style={{ textAlign: 'right' }}>
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}