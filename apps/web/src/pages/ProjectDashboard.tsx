import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  cancelAudit,
  getAuditProgress,
  getPageAuditDetail,
  getProject,
  getProjectHealth,
  getProjectPages,
  listMaterials,
  listChannels,
  listGenerations,
  reAuditPage,
} from '../api.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { FilterBar, type FilterOption } from '../components/FilterBar.js';
import { FindingList } from '../components/FindingList.js';

type FilterValue = 'all' | 'not_audited' | 'with_error' | 'discovered_via:sitemap' | 'discovered_via:crawl' | 'discovered_via:root';

const FILTER_OPTIONS: FilterOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'not_audited', label: 'Not audited' },
  { value: 'with_error', label: 'With error' },
  { value: 'discovered_via:sitemap', label: 'Sitemap' },
  { value: 'discovered_via:crawl', label: 'Crawl' },
  { value: 'discovered_via:root', label: 'Root' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const [filter, setFilter] = useState<FilterValue>('all');
  const apiFilter = filter === 'all' ? undefined : filter;
  const [openPageAuditId, setOpenPageAuditId] = useState<string | null>(null);

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

  // Phase 3 T7: live audit progress + cancel
  const lastAudit = project.data?.audits[0];
  const progress = useQuery({
    queryKey: ['audit-progress', lastAudit?.id],
    queryFn: () => getAuditProgress(lastAudit!.id),
    enabled: Boolean(lastAudit) && (lastAudit?.status === 'queued' || lastAudit?.status === 'running'),
    refetchInterval: 2_000,
  });

  const cancel = useMutation({
    mutationFn: (auditId: string) => cancelAudit(auditId),
    onSuccess: () => {
      project.refetch();
      progress.refetch();
    },
  });

  // F5.4 T4: re-audit button + diff modal
  const detail = useQuery({
    queryKey: ['page-audit-detail', openPageAuditId],
    queryFn: () => getPageAuditDetail(openPageAuditId!),
    enabled: Boolean(openPageAuditId),
    refetchInterval: (query) =>
      query.state.data?.status === 'queued' || query.state.data?.status === 'running' ? 1_000 : false,
  });

  const reAudit = useMutation({
    mutationFn: (pageId: string) => reAuditPage(pageId),
    onSuccess: (data) => {
      setOpenPageAuditId(data.pageAuditId);
    },
    onError: (err: Error) => {
      // eslint-disable-next-line no-alert
      window.alert(err.message);
    },
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
  const p = project.data;
  const latest = p.audits[0];

  return (
    <div className="page col" style={{ gap: 'var(--space-6)' }}>
      {/* Header */}
      <header className="page__header">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-2)' }}>
            <Link to="/projects" className="muted tiny">Projects</Link>
            <span className="muted tiny">/</span>
            <span className="tiny">{p.name}</span>
          </div>
          <h1 className="page__title">{p.name}</h1>
          <p className="page__subtitle mono">{p.rootUrl}</p>
        </div>
        <Link to={`/projects/${projectId}/audit`} className="btn btn--primary">
          Run audit
        </Link>
      </header>

      {/* Health card */}
      <ScoreCard label="Health overall" value={h?.overall ?? null} />

      {/* Phase 3 T7: Last audit progress + cancel */}
      {lastAudit && (
        <div className="card">
          <h3>Last audit</h3>
          <p>
            Status: <strong>{lastAudit.status}</strong>
          </p>
          {progress.data && (
            <>
              <p>
                {progress.data.pagesCompleted} / {progress.data.pagesTotal} pages completed (
                {progress.data.pagesFailed} failed, {progress.data.pagesSkipped} skipped)
              </p>
              {progress.data.currentPages.length > 0 && (
                <p>In progress: {progress.data.currentPages.join(', ')}</p>
              )}
              <div
                style={{
                  height: '8px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-pill)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${
                      progress.data.pagesTotal
                        ? (progress.data.pagesCompleted / progress.data.pagesTotal) * 100
                        : 0
                    }%`,
                    height: '100%',
                    background: 'var(--accent)',
                    transition: 'width 200ms ease',
                  }}
                />
              </div>
            </>
          )}
          {(lastAudit.status === 'queued' || lastAudit.status === 'running') && (
            <button
              type="button"
              onClick={() => cancel.mutate(lastAudit.id)}
              disabled={cancel.isPending}
              style={{ marginTop: 'var(--space-3)' }}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel audit'}
            </button>
          )}
        </div>
      )}

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
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => reAudit.mutate(page.id)}
                    disabled={reAudit.isPending}
                  >
                    {reAudit.isPending ? 'Queuing…' : 'Re-audit'}
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

      {/* F5.4 T4: re-audit diff modal */}
      {openPageAuditId && detail.data && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenPageAuditId(null)}
        >
          <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal__close"
              onClick={() => setOpenPageAuditId(null)}
              aria-label="Close"
            >
              ×
            </button>
            <h2 style={{ margin: 0, marginBottom: 'var(--space-2)', fontSize: 'var(--fs-lg)' }}>
              Re-audit: {detail.data.url}
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: 0, marginBottom: 'var(--space-4)' }}>
              Status: <strong style={{ color: 'var(--text)' }}>{detail.data.status}</strong>
              {detail.data.score && (
                <> · Score: <strong style={{ color: 'var(--text)' }}>{detail.data.score.overall}</strong></>
              )}
            </p>
            <FindingList findings={detail.data.findings as unknown as Parameters<typeof FindingList>[0]["findings"]} fixed={detail.data.fixed} />
          </div>
        </div>
      )}

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

      {/* Stat tiles — restored from F1 */}
      <section>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <StatTile
            label="Audits"
            value={p.audits.length}
            {...(latest?.status === 'completed' ? { accent: 'success' as const } : {})}
          />
          <StatTile label="Materials" value={materials.data?.length ?? '—'} />
          <StatTile label="Generations" value={generations.data?.length ?? '—'} />
          <StatTile label="Channels" value={channels.data?.length ?? '—'} />
        </div>
      </section>

      {/* Latest audit score — restored from F1 */}
      {latest?.score && (
        <section>
          <div className="spread" style={{ marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>Latest audit</h2>
            <Link to={`/audits/${latest.id}`} className="tiny">
              Open full report →
            </Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, auto) 1fr',
              gap: 'var(--space-3)',
              alignItems: 'stretch',
            }}
          >
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div
                className="tiny"
                style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 'var(--space-2)' }}
              >
                Overall
              </div>
              <div
                className="tabular"
                style={{
                  fontSize: 'var(--fs-2xl)',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                }}
              >
                {latest.score.overall}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 'var(--space-3)',
              }}
            >
              {Object.entries(latest.score.byCategory).map(([k, v]) => (
                <CategoryScoreCard key={k} label={k} value={v} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Audit history — restored from F1 */}
      {p.audits.length > 0 && (
        <section>
          <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, marginBottom: 'var(--space-3)' }}>Audit history</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Started</th>
                  <th style={{ textAlign: 'right' }}>Overall</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.audits.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`badge badge--${a.status}`}>{a.status}</span></td>
                    <td className="tiny tabular muted">{a.startedAt ? formatDate(a.startedAt) : '—'}</td>
                    <td className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {a.score?.overall ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/audits/${a.id}`} className="tiny">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: 'success';
}) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: accent === 'success' ? 'var(--accent-bright)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CategoryScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <span
        className="tiny"
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className="tabular"
        style={{
          fontSize: 'var(--fs-xl)',
          fontWeight: 700,
          letterSpacing: '-0.025em',
        }}
      >
        {value ?? '—'}
      </span>
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
