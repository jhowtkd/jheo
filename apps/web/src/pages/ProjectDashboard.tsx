import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  getProject,
  getProjectHealth,
  getProjectPages,
  listMaterials,
  listChannels,
  listGenerations,
} from '../api.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { FilterBar, type FilterOption } from '../components/FilterBar.js';

type FilterValue = 'all' | 'not_audited' | 'with_error' | 'discovered_via:sitemap' | 'discovered_via:crawl' | 'discovered_via:root';

const FILTER_OPTIONS: FilterOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'not_audited', label: 'Not audited' },
  { value: 'with_error', label: 'With error' },
  { value: 'discovered_via:sitemap', label: 'Sitemap' },
  { value: 'discovered_via:crawl', label: 'Crawl' },
  { value: 'discovered_via:root', label: 'Root' },
];

export function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const [filter, setFilter] = useState<FilterValue>('all');
  const apiFilter = filter === 'all' ? undefined : filter;

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: 5000,
  });

  const health = useQuery({
    queryKey: ['project-health', projectId],
    queryFn: () => getProjectHealth(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: 5_000,
  });

  const pages = useQuery({
    queryKey: ['project-pages', projectId, apiFilter],
    queryFn: () => getProjectPages(projectId!, apiFilter ? { filter: apiFilter, limit: 200 } : { limit: 200 }),
    enabled: Boolean(projectId),
    refetchInterval: 5_000,
  });

  // Materialized sections from F2/F3 — kept for backward compatibility
  const materials = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => listMaterials(projectId!),
    enabled: !!projectId,
    refetchInterval: 8000,
  });
  const channels = useQuery({
    queryKey: ['channels', projectId],
    queryFn: () => listChannels(projectId!),
    enabled: !!projectId,
    refetchInterval: 10000,
  });
  const generations = useQuery({
    queryKey: ['generations', projectId],
    queryFn: () => listGenerations(projectId!),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  if (project.isPending) {
    return (
      <div className="page">
        <div className="skeleton skeleton--title" style={{ marginBottom: 'var(--space-3)' }} />
        <div className="skeleton skeleton--text" style={{ width: '30%', marginBottom: 'var(--space-8)' }} />
        <div className="skeleton skeleton--card" />
      </div>
    );
  }
  if (project.isError) return <p>Failed to load project.</p>;
  if (!project.data) return <p>Not found.</p>;

  const h = health.data;
  const inFlight = (h?.pagesTotal ?? 0) - (h?.pagesAudited ?? 0) > 0;

  return (
    <div className="page col" style={{ gap: 'var(--space-6)' }}>
      {/* Header */}
      <header className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{project.data.name}</span>
          </div>
          <h1 className="page__title">{project.data.name}</h1>
          <p className="page__subtitle mono">{project.data.rootUrl}</p>
        </div>
        <Link to={`/projects/${projectId}/audit`} className="btn btn--primary">
          Run audit
        </Link>
      </header>

      {/* Health card */}
      <ScoreCard health={h} />

      {/* Filter bar */}
      <FilterBar value={filter} onChange={setFilter} options={FILTER_OPTIONS} />

      {/* Pages table */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Source</th>
              <th>Last audited</th>
              <th>Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pages.data?.items.map((page) => (
              <tr key={page.id}>
                <td>
                  <a href={page.url} target="_blank" rel="noreferrer" className="mono">
                    {page.url}
                  </a>
                </td>
                <td>
                  <span className={`tag tag--${page.discoveredVia}`}>{page.discoveredVia}</span>
                </td>
                <td>{page.lastAuditedAt ? new Date(page.lastAuditedAt).toLocaleString() : '—'}</td>
                <td>{page.lastScore ? Math.round(page.lastScore.overall) : '—'}</td>
                <td>
                  <button type="button" className="btn btn--secondary btn--sm" disabled title="Coming in F5.4">
                    Re-audit
                  </button>
                </td>
              </tr>
            ))}
            {pages.data?.items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                  No pages match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky footer with audited progress */}
      <footer
        style={{
          position: 'sticky',
          bottom: 0,
          padding: 'var(--space-3)',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="mono">
          {h?.pagesAudited ?? 0} / {h?.pagesTotal ?? 0} audited
        </span>
        {inFlight && <span className="spinner" aria-label="In progress" />}
      </footer>

      {/* Workspace quick links — preserved from F2/F3 (materials, channels, generations) */}
      <section>
        <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>Workspace</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <QuickLink
            to={`/projects/${projectId}/materials`}
            label="Materials"
            hint="Sources the generator uses for context (URLs, files, notes)"
            {...(materials.data ? { count: materials.data.length } : {})}
          />
          <QuickLink
            to={`/projects/${projectId}/compose`}
            label="Generate"
            hint="Compose a new generation from a template + materials"
            {...(generations.data ? { count: generations.data.length } : {})}
          />
          <QuickLink
            to={`/projects/${projectId}/channels`}
            label="Channels"
            hint="Where approved generations are published (WordPress, HTTP, agent)"
            {...(channels.data ? { count: channels.data.length } : {})}
          />
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  to,
  label,
  hint,
  count,
}: {
  to: string;
  label: string;
  hint: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className="card card--interactive"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      <div className="spread">
        <span style={{ fontWeight: 600 }}>{label}</span>
        {count !== undefined && (
          <span className="tabular tiny muted">{count}</span>
        )}
      </div>
      <p className="tiny muted" style={{ margin: 0, lineHeight: 1.5 }}>{hint}</p>
    </Link>
  );
}
